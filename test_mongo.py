import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test_connection():
    try:
        # Test connection
        client = AsyncIOMotorClient('mongodb://localhost:27017/')
        
        # Test database access
        db = client['trading_strategy_db']
        collection = db['test_collection']
        
        # Insert a test document
        result = await collection.insert_one({"test": "connection", "timestamp": "2023-11-10"})
        print(f"Inserted document with id: {result.inserted_id}")
        
        # Query the test document
        doc = await collection.find_one({"_id": result.inserted_id})
        print(f"Found document: {doc}")
        
        # List all collections
        collections = await db.list_collection_names()
        print(f"Collections in database: {collections}")
        
        # Count documents in historical_data
        count = await db.historical_data.count_documents({})
        print(f"Documents in historical_data: {count}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'client' in locals():
            client.close()

# Run the test
if __name__ == "__main__":
    asyncio.run(test_connection())
