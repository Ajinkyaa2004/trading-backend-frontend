from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from bson import ObjectId
from uuid import uuid4

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)
        
    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")

class FileMetadata(BaseModel):
    file_id: str = Field(default_factory=lambda: str(uuid4()))
    filename: str
    symbol: str
    row_count: int
    size_mb: float
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    columns: List[str]
    validated: bool = False

    class Config:
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }
        json_schema_extra = {
            "example": {
                "file_id": "507f1f77bcf86cd799439011",
                "filename": "nq_ohlcv_2020_2025.csv",
                "symbol": "NQH0",
                "row_count": 2000000,
                "size_mb": 95.0,
                "uploaded_at": "2025-11-10T14:00:00Z",
                "columns": ["date_time", "open", "high", "low", "close", "volume"],
                "validated": True
            }
        }

class HistoricalData(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    strategy_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    parameters: Dict[str, Any]
    metrics: Dict[str, Any]
    equity_curve: List[Dict[str, float]]
    trades: List[Dict[str, Any]]
    metadata: Dict[str, Any] = {}
    file_metadata: Optional[FileMetadata] = None

    model_config = {
        "populate_by_name": True,
        "json_encoders": {ObjectId: str},
        "json_schema_extra": {
            "example": {
                "strategy_name": "mean_reversion",
                "timestamp": "2023-01-01T00:00:00",
                "parameters": {"window": 20, "entry_z": 2.0, "exit_z": 0.5},
                "metrics": {"sharpe_ratio": 1.5, "max_drawdown": -0.15, "win_rate": 0.6, "total_pnl": 1000},
                "equity_curve": [
                    {"date": "2023-01-01", "value": 10000},
                    {"date": "2023-01-02", "value": 10100}
                ],
                "trades": [
                    {
                        "entry_time": "2023-01-01T10:00:00",
                        "exit_time": "2023-01-01T10:30:00",
                        "entry_price": 100.0,
                        "exit_price": 101.0,
                        "pnl": 100,
                        "return_pct": 0.01
                    }
                ],
                "metadata": {"notes": "Test run with default parameters"}
            }
        }
    }
