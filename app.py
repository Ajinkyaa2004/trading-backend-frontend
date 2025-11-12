#!/usr/bin/env python3
"""
Minimal Trading Backtesting API for deployment testing
"""
import os
import json
from typing import List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException
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
    size: int
    status: str

# In-memory storage for demo (replace with database later)
uploaded_files: List[FileInfo] = []

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Trading Backtesting API is running!",
        "status": "healthy",
        "version": "1.0.0"
    }

@app.get("/files")
async def list_files() -> List[FileInfo]:
    """List uploaded files"""
    return uploaded_files

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a CSV file for backtesting"""
    
    # Basic validation
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Save file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Add to file list
        file_info = FileInfo(
            filename=file.filename,
            size=len(content),
            status="uploaded"
        )
        uploaded_files.append(file_info)
        
        return {
            "message": f"File {file.filename} uploaded successfully",
            "filename": file.filename,
            "size": len(content)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@app.post("/backtest")
async def run_backtest(filename: str, params: BacktestParams):
    """Run backtesting on uploaded file"""
    
    # Check if file exists
    file_exists = any(f.filename == filename for f in uploaded_files)
    if not file_exists:
        raise HTTPException(status_code=404, detail="File not found. Please upload a CSV file first.")
    
    # For now, return mock results (replace with actual backtesting later)
    mock_results = {
        "filename": filename,
        "parameters": params.dict(),
        "metrics": {
            "total_trades": 25,
            "winning_trades": 15,
            "losing_trades": 10,
            "win_rate": 60.0,
            "total_pnl": 2500.0,
            "max_drawdown": -500.0,
            "sharpe_ratio": 1.2,
            "final_balance": params.starting_balance + 2500.0
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
    
    return mock_results

@app.get("/health")
async def health_check():
    """Extended health check"""
    return {
        "status": "healthy",
        "service": "Trading Backtesting API",
        "version": "1.0.0",
        "endpoints": ["/", "/files", "/upload", "/backtest", "/health"],
        "data_directory": DATA_DIR,
        "uploaded_files_count": len(uploaded_files)
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
