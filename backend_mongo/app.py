import os
import uuid
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError
from motor.motor_asyncio import AsyncIOMotorClient

from backend.schemas import BacktestParams, BacktestCreateResponse
from backend.utils import validate_csv, normalize_ohlc_headers
from backend.strategy_adapter import run_backtest_to_outputs

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)
DATA_DIR = os.path.join(ROOT_DIR, "data")
DOWNLOAD_DIR = os.path.join(DATA_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGODB_DB", "backtests_db")
COLL_NAME = os.getenv("MONGODB_COLL", "backtests")

app = FastAPI(title="Backtesting API (Mongo)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo_client: AsyncIOMotorClient | None = None

def get_collection():
    if mongo_client is None:
        raise RuntimeError("Mongo client not initialized")
    return mongo_client[DB_NAME][COLL_NAME]

@app.on_event("startup")
async def on_startup():
    global mongo_client
    mongo_client = AsyncIOMotorClient(MONGODB_URI)
    # create indexes
    await get_collection().create_index("id", unique=True)
    await get_collection().create_index("created_at")

@app.on_event("shutdown")
async def on_shutdown():
    global mongo_client
    if mongo_client:
        mongo_client.close()

@app.post("/backtests", response_model=BacktestCreateResponse)
async def create_backtest(
    file: UploadFile = File(...),
    params_json: str = Form(None),
):
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

    try:
        params = BacktestParams.model_validate_json(params_json) if params_json else BacktestParams()
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    coll = get_collection()
    # Insert initial document
    doc = {
        "id": bt_id,
        "created_at": None,  # will rely on Mongo's server time if needed
        "original_filename": file.filename,
        "stored_csv_path": stored_csv,
        "params": params.model_dump(),
        "metrics": None,
        "equity_curve": None,
        "monthly_returns": None,
        "trades_csv_path": None,
        "metrics_csv_path": None,
        "status": "running",
        "error": None,
        "rows": rows,
        "size_bytes": len(contents),
    }
    await coll.insert_one(doc)

    # Run the backtest synchronously (in-request) for parity with SQL version
    try:
        payload, trades_csv, metrics_csv, chart_data = run_backtest_to_outputs(
            stored_csv, params.model_dump(), DOWNLOAD_DIR
        )
    except Exception as e:
        await coll.update_one({"id": bt_id}, {"$set": {"status": "failed", "error": str(e)}})
        raise HTTPException(status_code=500, detail=f"Backtest failed: {e}")

    # Save results
    await coll.update_one(
        {"id": bt_id},
        {
            "$set": {
                "status": "completed",
                "metrics": payload.get("metrics"),
                "equity_curve": chart_data.get("equity_curve"),
                "monthly_returns": chart_data.get("monthly_returns"),
                "trades_csv_path": trades_csv,
                "metrics_csv_path": metrics_csv,
            }
        },
    )

    return {"id": bt_id}

@app.get("/backtests")
async def list_backtests():
    coll = get_collection()
    cursor = coll.find({}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for r in cursor:
        out.append({
            "id": r.get("id"),
            "created_at": r.get("created_at"),
            "filename": r.get("original_filename"),
            "status": r.get("status"),
            "rows": r.get("rows"),
            "size_bytes": r.get("size_bytes"),
        })
    return out

@app.get("/backtests/{bt_id}")
async def get_backtest(bt_id: str):
    coll = get_collection()
    r = await coll.find_one({"id": bt_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    if r.get("status") != "completed":
        return {"status": r.get("status"), "error": r.get("error")}

    def dl(path: Optional[str]) -> Optional[str]:
        if not path:
            return None
        return f"/downloads/{os.path.basename(path)}"

    return {
        "trades": [],
        "metrics": r.get("metrics") or {},
        "chart_data": {
            "equity_curve": r.get("equity_curve") or {"dates": [], "balance": []},
            "monthly_returns": r.get("monthly_returns") or {"months": [], "pnl": []},
        },
        "download_links": {
            "trades_csv": dl(r.get("trades_csv_path")),
            "metrics_csv": dl(r.get("metrics_csv_path")),
        },
    }

@app.get("/downloads/{filename}")
async def download_file(filename: str):
    full_path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path, filename=filename)
