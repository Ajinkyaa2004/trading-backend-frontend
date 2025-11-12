#!/usr/bin/env python3
"""
Minimal Trading Backtesting API for deployment testing
"""
import os
import json
import io
import csv
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(
    title="Trading Backtesting API",
    description="A minimal trading strategy backtesting platform",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create data directories
DATA_DIR = "data"
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Pydantic models
class BacktestParams(BaseModel):
    starting_balance: float = 10000
    risk_percentage: float = 2.0
    tick_size: float = 0.25
    tick_value: float = 12.5
    commission_per_trade: float = 5.0
    slippage_ticks: int = 0
    tp_ticks: int = 12
    sl_ticks: int = 6
    trailing_stop: bool = False
    trailing_stop_ticks: int = 0
    contract_margin: float = 500

class FileInfo(BaseModel):
    filename: str
    symbol: str = "DEFAULT"
    uploaded_at: datetime
    row_count: int
    size_mb: float
    status: str = "uploaded"

# In-memory storage for demo (will persist during server runtime)
uploaded_files: List[FileInfo] = []

# Add sample data for testing (can be removed later)
def initialize_sample_data():
    """Initialize with sample data for testing"""
    if not uploaded_files:  # Only add if list is empty
        sample_file = FileInfo(
            filename="sample_data.csv",
            symbol="NIFTY",
            uploaded_at=datetime(2024, 11, 13, 2, 0, 0),
            row_count=1000,
            size_mb=0.05,
            status="uploaded"
        )
        uploaded_files.append(sample_file)

# Initialize sample data on startup
initialize_sample_data()

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Trading Backtesting API is running!",
        "status": "healthy", 
        "version": "1.0.4",
        "endpoints": ["/api/files/", "/upload", "/api/files/upload/", "/backtests", "/api/historical-data/"],
        "uploaded_files_count": len(uploaded_files),
        "note": "Fixed win_rate format and added missing metrics (avg_pnl, best_trade, worst_trade)"
    }

@app.get("/api/files/")
async def list_files() -> List[Dict[str, Any]]:
    """List uploaded files"""
    # Convert FileInfo objects to dictionaries for JSON serialization
    return [file.dict() for file in uploaded_files]

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), symbol: str = Form("DEFAULT")):
    """Upload a CSV file for backtesting"""
    
    # Basic validation
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Save file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        content = await file.read()
        
        # Parse CSV to get row count
        csv_content = io.StringIO(content.decode('utf-8'))
        csv_reader = csv.reader(csv_content)
        
        # Skip header and count rows
        next(csv_reader, None)  # Skip header
        row_count = sum(1 for _ in csv_reader)
        
        # Save file
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Calculate file size in MB
        size_mb = len(content) / (1024 * 1024)
        
        # Add to file list with proper structure
        file_info = FileInfo(
            filename=file.filename,
            symbol=symbol,
            uploaded_at=datetime.utcnow(),
            row_count=row_count,
            size_mb=round(size_mb, 2),
            status="uploaded"
        )
        uploaded_files.append(file_info)
        
        return {
            "message": f"File {file.filename} uploaded successfully",
            "filename": file.filename,
            "size_mb": size_mb,
            "row_count": row_count,
            "symbol": symbol
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@app.post("/api/files/upload/")
async def upload_file_api(
    file: UploadFile = File(...),
    symbol: str = Form("DEFAULT"),
    validate: bool = Form(True)
):
    """
    API endpoint for file upload that matches the expected interface
    """
    return await upload_file(file, symbol)

@app.post("/backtests")
async def run_backtest(file: UploadFile = File(...), params_json: str = Form("")):
    """Run backtesting on uploaded file"""
    
    # Basic validation
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Parse parameters (optional, use defaults if not provided)
    try:
        params = json.loads(params_json) if params_json else {}
    except:
        params = {}
    
    # For now, return mock results (replace with actual backtesting later)
    starting_balance = params.get("starting_balance", 10000)
    mock_results = {
        "filename": file.filename,
        "parameters": params,
        "metrics": {
            "total_trades": 25,
            "winning_trades": 15,
            "losing_trades": 10,
            "win_rate": 0.60,  # Fixed: Should be 0.60 (60%) not 60.0
            "total_pnl": 2500.0,
            "avg_pnl": 100.0,  # Added missing metric
            "max_drawdown": -500.0,
            "sharpe_ratio": 1.2,
            "best_trade": 350.0,  # Added missing metric
            "worst_trade": -200.0,  # Added missing metric
            "final_balance": starting_balance + 2500.0
        },
        "trades": [
            {
                "entry_time": "2024-01-01 10:00:00",
                "exit_time": "2024-01-01 10:30:00", 
                "type": "LONG",
                "entry_price": 4500.0,
                "exit_price": 4512.0,
                "pnl": 150.0,
                "outcome": "WIN"
            }
        ],
        "status": "completed",
        "message": "Backtesting completed successfully! (Demo results - full functionality coming soon)"
    }
    
    return {"id": "demo-123"}

@app.get("/backtests/{backtest_id}")
async def get_backtest_detail(backtest_id: str):
    """Get detailed backtest results"""
    mock_detail = {
        "id": backtest_id,
        "filename": "demo_data.csv",
        "parameters": {
            "starting_balance": 10000,
            "risk_percentage": 2.0,
        },
        "metrics": {
            "total_trades": 25,
            "winning_trades": 15,
            "losing_trades": 10,
            "win_rate": 60.0,
            "total_pnl": 2500.0,
            "max_drawdown": -500.0,
            "sharpe_ratio": 1.2,
            "final_balance": 12500.0
        },
        "trades": [
            {
                "entry_time": "2024-01-01 10:00:00",
                "exit_time": "2024-01-01 10:30:00", 
                "type": "LONG",
                "entry_price": 4500.0,
                "exit_price": 4512.0,
                "pnl": 150.0,
                "outcome": "WIN"
            }
        ],
        "status": "completed"
    }
    return mock_detail

@app.get("/api/historical-data/")
async def get_historical_data(limit: int = 100):
    """Get historical backtest data"""
    mock_historical = [
        {
            "id": "demo-123",
            "filename": "demo_data.csv",
            "created_at": "2024-01-01T10:00:00Z",
            "status": "completed",
            "metrics": {
                "total_pnl": 2500.0,
                "win_rate": 60.0,
                "total_trades": 25
            }
        }
    ]
    return mock_historical

@app.get("/api/historical-data/{data_id}")
async def get_historical_data_detail(data_id: str):
    """Get specific historical backtest detail"""
    return await get_backtest_detail(data_id)

@app.get("/debug/routes")
async def debug_routes():
    """Debug endpoint to show all available routes"""
    return {
        "available_routes": [
            "GET /",
            "GET /api/files/",
            "POST /upload", 
            "POST /backtests",
            "GET /backtests/{id}",
            "GET /api/historical-data/",
            "GET /api/historical-data/{id}",
            "GET /health",
            "GET /debug/routes"
        ],
        "deployment_time": "2024-11-13T02:33:00Z",
        "version": "1.0.1"
    }

@app.get("/health")
async def health_check():
    """Extended health check"""
    return {
        "status": "healthy",
        "service": "Trading Backtesting API", 
        "version": "1.0.3",
        "endpoints": ["/api/files/", "/upload", "/api/files/upload/", "/backtests", "/api/historical-data/"],
        "data_directory": DATA_DIR,
        "uploaded_files_count": len(uploaded_files),
        "fix_applied": "Fixed /api/files/ endpoint and /backtests form data handling"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
