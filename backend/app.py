import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
import os
import csv
import io

from backend.db import SessionLocal, init_db
from backend.models import Backtest
from backend.schemas import BacktestParams, BacktestCreateResponse
from backend.mongo_models import HistoricalData, PyObjectId, FileMetadata
from backend.utils import validate_csv, normalize_ohlc_headers
from backend.strategy_adapter import run_backtest_to_outputs
from backend.mongo_utils import mongodb

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
DOWNLOAD_DIR = os.path.join(DATA_DIR, "downloads")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

# Create necessary directories
for directory in [DATA_DIR, DOWNLOAD_DIR, UPLOAD_DIR]:
    os.makedirs(directory, exist_ok=True)

app = FastAPI(title="Backtesting API")
# Configure CORS - Allow all localhost origins for development
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:56064",  # Browser preview proxy
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SQLite database
init_db()

from backend.mongo_utils import mongodb

@app.post("/backtests", response_model=BacktestCreateResponse)
async def create_backtest(
    file: UploadFile = File(...),
    params_json: str = Form(None),
):
    # Store uploaded file
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    bt_id = uuid.uuid4().hex
    stored_csv = os.path.join(DOWNLOAD_DIR, f"upload_{bt_id}.csv")

    contents = await file.read()
    with open(stored_csv, "wb") as f:
        f.write(contents)

    ok, msg, rows = validate_csv(stored_csv)
    if not ok:
        os.remove(stored_csv)
        raise HTTPException(status_code=400, detail=msg)

    normalize_ohlc_headers(stored_csv)

    # Parse params
    try:
        params = BacktestParams.model_validate_json(params_json) if params_json else BacktestParams()
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist a record with status running
    db = SessionLocal()
    try:
        bt = Backtest(
            id=bt_id,
            original_filename=file.filename,
            stored_csv_path=stored_csv,
            params=params.model_dump(),
            status="running",
            rows=rows,
            size_bytes=len(contents),
        )
        db.add(bt)
        db.commit()
    finally:
        db.close()

    # Run backtest synchronously for now
    try:
        payload, trades_csv, metrics_csv, chart_data = run_backtest_to_outputs(
            stored_csv, params.model_dump(), DOWNLOAD_DIR
        )
    except Exception as e:
        db = SessionLocal()
        try:
            bt = db.get(Backtest, bt_id)
            if bt:
                bt.status = "failed"
                bt.error = str(e)
                db.commit()
        finally:
            db.close()
        raise HTTPException(status_code=500, detail=f"Backtest failed: {e}")

    # Save results
    db = SessionLocal()
    try:
        bt = db.get(Backtest, bt_id)
        bt.status = "completed"
        bt.metrics = payload["metrics"]
        bt.equity_curve = chart_data.get("equity_curve")
        bt.monthly_returns = chart_data.get("monthly_returns")
        bt.trades_csv_path = trades_csv
        bt.metrics_csv_path = metrics_csv
        db.commit()
    finally:
        db.close()

    # Automatically save to MongoDB
    try:
        # Prepare historical data for MongoDB
        historical_data = {
            "backtest_id": bt_id,
            "strategy_name": "EMA Crossover Strategy",
            "timestamp": datetime.utcnow(),
            "original_filename": file.filename,
            "parameters": params.model_dump(),
            "metrics": payload["metrics"],
            "trades": payload["trades"],
            "equity_curve": chart_data.get("equity_curve"),
            "monthly_returns": chart_data.get("monthly_returns"),
            "trades_csv_path": trades_csv,
            "metrics_csv_path": metrics_csv,
            "status": "completed"
        }
        
        # Save to MongoDB
        await mongodb.save_historical_data(historical_data)
        print(f"✓ Backtest results automatically saved to MongoDB with ID: {bt_id}")
    except Exception as mongo_err:
        print(f"Warning: Failed to save to MongoDB: {mongo_err}")
        # Don't fail the request if MongoDB save fails

    return {"id": bt_id}

@app.get("/backtests")
async def list_backtests():
    db = SessionLocal()
    try:
        rows = db.query(Backtest).order_by(Backtest.created_at.desc()).all()
        out = []
        for r in rows:
            out.append({
                "id": r.id,
                "created_at": r.created_at,
                "filename": r.original_filename,
                "status": r.status,
                "rows": r.rows,
                "size_bytes": r.size_bytes,
            })
        return out
    finally:
        db.close()

@app.get("/backtests/{bt_id}")
async def get_backtest(bt_id: str):
    db = SessionLocal()
    try:
        r = db.get(Backtest, bt_id)
        if not r:
            raise HTTPException(status_code=404, detail="Not found")
        if r.status != "completed":
            return {"status": r.status, "error": r.error}

        def dl(path: str) -> str:
            return f"/downloads/{os.path.basename(path)}"

        # Try to get trades from MongoDB if available
        trades_data = []
        try:
            # Query MongoDB for this specific backtest
            mongo_doc = await mongodb.historical_data.find_one({"backtest_id": bt_id})
            if mongo_doc and 'trades' in mongo_doc:
                trades_data = mongo_doc['trades']
        except Exception as e:
            print(f"Could not fetch trades from MongoDB: {e}")
        
        return {
            "trades": trades_data,  # Include trades for charts
            "metrics": r.metrics or {},
            "chart_data": {
                "equity_curve": r.equity_curve or {"dates": [], "balance": []},
                "monthly_returns": r.monthly_returns or {"months": [], "pnl": []},
            },
            "download_links": {
                "trades_csv": dl(r.trades_csv_path) if r.trades_csv_path else None,
                "metrics_csv": dl(r.metrics_csv_path) if r.metrics_csv_path else None,
            },
        }
    finally:
        db.close()

@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename)

@app.get("/downloads/{filename}")
async def download_file_alt(filename: str):
    """Alternative download endpoint for compatibility"""
    file_path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename)

# File Upload Endpoints
@app.post("/api/files/upload/", response_model=Dict[str, Any])
async def upload_file(
    file: UploadFile = File(...),
    symbol: str = Form(...),
    validate: bool = Form(True)
):
    """
    Upload a CSV file and save its metadata to MongoDB
    """
    try:
        # Read file content
        content = await file.read()
        
        # Parse CSV to get columns and row count
        csv_content = io.StringIO(content.decode('utf-8'))
        csv_reader = csv.reader(csv_content)
        
        # Get header and count rows
        columns = next(csv_reader, [])
        row_count = sum(1 for _ in csv_reader)  # Count remaining rows
        
        # Save file to uploads directory
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Calculate file size in MB
        size_mb = os.path.getsize(file_path) / (1024 * 1024)
        
        # Create file metadata
        file_metadata = {
            "filename": file.filename,
            "symbol": symbol,
            "row_count": row_count,
            "size_mb": round(size_mb, 2),
            "columns": columns,
            "validated": validate,
            "file_path": file_path
        }
        
        # Save to MongoDB
        result = await mongodb.save_file_metadata(file_metadata)
        
        return {
            "status": "success",
            "message": "File uploaded successfully",
            "file_metadata": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# File Metadata Endpoints
@app.get("/api/files/", response_model=List[Dict[str, Any]])
async def list_files_metadata(
    symbol: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100
):
    """
    List file metadata with optional filters
    """
    files = await mongodb.list_files_metadata(
        symbol=symbol,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )
    return files

@app.get("/api/files/{file_id}", response_model=Dict[str, Any])
async def get_file_metadata(file_id: str):
    """
    Get file metadata by file_id
    """
    file_meta = await mongodb.get_file_metadata(file_id)
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")
    return file_meta

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    """
    Delete a file and its metadata
    """
    # Get file metadata first
    file_meta = await mongodb.get_file_metadata(file_id)
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete the actual file if it exists
    if 'file_path' in file_meta and os.path.exists(file_meta['file_path']):
        try:
            os.remove(file_meta['file_path'])
        except Exception as e:
            print(f"Error deleting file: {e}")
    
    # Delete metadata from MongoDB
    success = await mongodb.delete_file_metadata(file_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete file metadata")
    
    return {"status": "success", "message": "File and metadata deleted"}

# Historical Data Endpoints
@app.post("/api/historical-data/", response_model=Dict[str, Any])
async def save_historical_data(data: HistoricalData):
    """
    Save historical backtest data to MongoDB
    """
    data_dict = data.dict(by_alias=True, exclude={"id"})  # Exclude id as it will be auto-generated
    
    # If file_metadata is provided, save it to the files_metadata collection
    if 'file_metadata' in data_dict and data_dict['file_metadata']:
        file_meta = data_dict.pop('file_metadata')
        file_meta['validated'] = True  # Mark as validated since it's coming from a backtest
        saved_meta = await mongodb.save_file_metadata(file_meta)
        data_dict['file_metadata_id'] = saved_meta['file_id']
    
    result = await mongodb.save_historical_data(data_dict)
    return JSONResponse(status_code=201, content=result)

@app.get("/api/historical-data/", response_model=List[Dict[str, Any]])
async def list_historical_data(
    strategy_name: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100
):
    """
    Retrieve historical backtest data with optional filters
    """
    data = await mongodb.get_historical_data(
        strategy_name=strategy_name,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )
    
    # Add file metadata to each historical data entry if available
    for entry in data:
        if 'file_metadata_id' in entry:
            file_meta = await mongodb.get_file_metadata(entry['file_metadata_id'])
            if file_meta:
                entry['file_metadata'] = file_meta
    
    return data

@app.get("/api/historical-data/{data_id}", response_model=Dict[str, Any])
async def get_historical_data(data_id: str):
    """
    Get a specific historical backtest by ID
    """
    data = await mongodb.get_historical_data_by_id(data_id)
    if not data:
        raise HTTPException(status_code=404, detail="Historical data not found")
    
    # Add file metadata if available
    if 'file_metadata_id' in data:
        file_meta = await mongodb.get_file_metadata(data['file_metadata_id'])
        if file_meta:
            data['file_metadata'] = file_meta
    
    return data

@app.delete("/api/historical-data/{data_id}")
async def delete_historical_data(data_id: str):
    """
    Delete a specific historical backtest by ID
    """
    # Get the historical data first to check for file metadata
    data = await mongodb.get_historical_data_by_id(data_id)
    if not data:
        raise HTTPException(status_code=404, detail="Historical data not found")
    
    # If there's associated file metadata, delete it
    if 'file_metadata_id' in data:
        await mongodb.delete_file_metadata(data['file_metadata_id'])
    
    # Delete the historical data
    success = await mongodb.delete_historical_data(data_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete historical data")
    
    return {"status": "success", "message": "Historical data and associated file metadata deleted"}

# Mount static files for the web frontend
WEB_DIR = os.path.join(ROOT_DIR, "web")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="static")
