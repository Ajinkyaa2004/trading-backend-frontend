from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from bson import ObjectId
import os

class MongoDBManager:
    def __init__(self, connection_string: str = None, db_name: str = "trading_strategy_db"):
        if connection_string is None:
            connection_string = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        print(f"Connecting to MongoDB at {connection_string}")
        self.client = AsyncIOMotorClient(connection_string)
        self.db = self.client[db_name]
        print(f"Using database: {db_name}")
        
        # Initialize collections
        self.historical_data = self.db["historical_data"]
        self.files_metadata = self.db["files_metadata"]
        
        print("Collections initialized")
        
        # Note: Indexes will be created on first use
        self._indexes_created = False
        
    async def _ensure_indexes(self):
        """Ensure indexes are created (called on first use)"""
        if self._indexes_created:
            return
        try:
            print("Creating indexes...")
            # Create index for files_metadata collection
            await self.files_metadata.create_indexes([
                IndexModel([("file_id", ASCENDING)], unique=True, name="file_id_unique"),
                IndexModel([("filename", ASCENDING)], name="filename_index"),
                IndexModel([("symbol", ASCENDING)], name="symbol_index"),
                IndexModel([("uploaded_at", DESCENDING)], name="uploaded_at_desc")
            ])
            
            # Create index for historical_data collection
            await self.historical_data.create_indexes([
                IndexModel([("strategy_name", ASCENDING)], name="strategy_name_index"),
                IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")
            ])
            print("Indexes created successfully")
            self._indexes_created = True
        except Exception as e:
            print(f"Error creating indexes: {e}")
            # Don't raise - indexes are not critical for basic operation
    
    async def save_historical_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Save historical backtest data to MongoDB"""
        await self._ensure_indexes()
        result = await self.historical_data.insert_one(data)
        doc = await self.historical_data.find_one({"_id": result.inserted_id})
        if doc and '_id' in doc:
            doc['_id'] = str(doc['_id'])
        return doc
    
    async def get_historical_data(
        self, 
        strategy_name: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Retrieve historical data with optional filters"""
        query = {}
        if strategy_name:
            query["strategy_name"] = strategy_name
        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date
        
        cursor = self.historical_data.find(query).sort("timestamp", DESCENDING).limit(limit)
        result = []
        async for doc in cursor:
            if doc and '_id' in doc:
                doc['_id'] = str(doc['_id'])
            result.append(doc)
        return result
    
    async def get_historical_data_by_id(self, data_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific historical data entry by ID"""
        doc = await self.historical_data.find_one({"_id": ObjectId(data_id)})
        if doc and '_id' in doc:
            doc['_id'] = str(doc['_id'])
        return doc
    
    async def delete_historical_data(self, data_id: str) -> bool:
        """Delete a specific historical data entry by ID"""
        result = await self.historical_data.delete_one({"_id": ObjectId(data_id)})
        return result.deleted_count > 0

    # File Metadata Operations
    async def save_file_metadata(self, file_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save file metadata to MongoDB
        
        Args:
            file_data: Dict containing file metadata with keys:
                - filename: str
                - symbol: str
                - row_count: int
                - size_mb: float
                - columns: List[str]
                - validated: bool (optional)
                
        Returns:
            Dict containing the saved file metadata with generated file_id
        """
        try:
            await self._ensure_indexes()
            
            # Add timestamp if not provided
            if 'uploaded_at' not in file_data:
                file_data['uploaded_at'] = datetime.utcnow()
            
            # Ensure file_id exists
            if 'file_id' not in file_data:
                file_data['file_id'] = str(ObjectId())
                
            print(f"Saving file metadata: {file_data}")
            
            # Insert the document
            result = await self.files_metadata.insert_one(file_data)
            print(f"Insert result: {result.inserted_id}")
            
            # Get the complete document and convert ObjectId to string
            doc = await self.files_metadata.find_one({"_id": result.inserted_id})
            if doc and '_id' in doc:
                doc['_id'] = str(doc['_id'])
            
            print(f"Saved document: {doc}")
            return doc
            
        except Exception as e:
            print(f"Error saving file metadata: {e}")
            raise
    
    async def get_file_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve file metadata by file_id"""
        try:
            doc = await self.files_metadata.find_one({"file_id": file_id})
            if doc and '_id' in doc:
                doc['_id'] = str(doc['_id'])
            return doc
        except Exception as e:
            print(f"Error getting file metadata: {e}")
            return None
    
    async def list_files_metadata(
        self, 
        symbol: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List file metadata with optional filters"""
        try:
            query = {}
                
            if symbol:
                query["symbol"] = symbol
                
            if start_date or end_date:
                query["uploaded_at"] = {}
                if start_date:
                    query["uploaded_at"]["$gte"] = start_date
                if end_date:
                    query["uploaded_at"]["$lte"] = end_date
                    
            cursor = self.files_metadata.find(query).sort("uploaded_at", DESCENDING).limit(limit)
            
            # Convert ObjectId to string for all documents
            result = []
            async for doc in cursor:
                if doc and '_id' in doc:
                    doc['_id'] = str(doc['_id'])
                result.append(doc)
                
            return result
            
        except Exception as e:
            print(f"Error listing files metadata: {e}")
            return []
    
    async def update_file_metadata(self, file_id: str, updates: Dict[str, Any]) -> bool:
        """Update file metadata"""
        # Don't allow updating file_id
        updates.pop('file_id', None)
        updates.pop('_id', None)
        
        result = await self.files_metadata.update_one(
            {"file_id": file_id},
            {"$set": updates}
        )
        return result.modified_count > 0
    
    async def delete_file_metadata(self, file_id: str) -> bool:
        """Delete file metadata by file_id"""
        result = await self.files_metadata.delete_one({"file_id": file_id})
        return result.deleted_count > 0

# Create a global instance
mongodb = MongoDBManager()
