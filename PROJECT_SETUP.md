# Trading Backtest Platform - Setup Complete

## ✅ Project Status: RUNNING

Your trading backtest platform is now fully operational with automatic MongoDB integration!

## 🚀 What's Running

1. **MongoDB Server** (Port 27017)
   - Database: `trading_strategy_db`
   - Data directory: `/Users/ajinkya/Downloads/New folder/data/mongodb`
   - Collections: `historical_data`, `files_metadata`

2. **Backend API Server** (Port 8000)
   - FastAPI application with CORS enabled
   - SQLite for backtest records
   - MongoDB for historical data storage
   - Automatic data persistence on each backtest

3. **Frontend Web Interface**
   - Accessible at: http://localhost:8000
   - Browser preview available at: http://127.0.0.1:49439

## 📊 Features

### CSV Upload & Backtesting
- Upload CSV files with OHLC data
- Required columns: `date_time` (or `datetime` or `date time`), `open`, `high`, `low`, `close`
- Configure strategy parameters:
  - Starting balance
  - Take profit/stop loss (ticks)
  - Risk percentage
  - Trailing stop
  - Commission & slippage

### Automatic MongoDB Storage
When you run a backtest, the system automatically:
- ✅ Saves all backtest results to MongoDB
- ✅ Stores metrics (win rate, P&L, Sharpe ratio, etc.)
- ✅ Saves trade history
- ✅ Stores equity curve data
- ✅ Records monthly returns
- ✅ Keeps file metadata

### Results & Visualization
- Interactive equity curve charts
- Monthly returns bar charts
- Detailed metrics dashboard
- Downloadable CSV reports (trades & metrics)
- Paginated trade history table
- Filter trades by P&L and position type

## 🔧 How to Use

1. **Open the Frontend**
   - Navigate to http://localhost:8000 in your browser
   - Or use the browser preview link provided

2. **Upload Your CSV File**
   - Click "Choose File" and select your OHLC CSV
   - Preview will show first 10 rows
   - Adjust strategy parameters as needed

3. **Run Backtest**
   - Click "Run Backtest" button
   - Wait for processing (status shown on screen)
   - Results automatically saved to MongoDB

4. **View Results**
   - Metrics displayed in dashboard
   - Charts show equity curve and monthly returns
   - Download CSV files for detailed analysis
   - Load trade history table with filters

## 📁 Data Storage

### SQLite Database
- Location: `/Users/ajinkya/Downloads/New folder/backtests.db`
- Stores: Backtest metadata, status, file paths

### MongoDB Collections
- **historical_data**: Complete backtest results with all trades and metrics
- **files_metadata**: Uploaded file information and statistics

### File System
- Uploads: `/Users/ajinkya/Downloads/New folder/data/uploads/`
- Downloads: `/Users/ajinkya/Downloads/New folder/data/downloads/`
  - Generated trades CSV files
  - Generated metrics CSV files

## 🔍 API Endpoints

### Backtest Operations
- `POST /backtests` - Upload CSV and run backtest
- `GET /backtests` - List all backtests
- `GET /backtests/{id}` - Get backtest details
- `GET /downloads/{filename}` - Download result files

### MongoDB Operations
- `GET /api/historical-data/` - List historical backtests
- `GET /api/historical-data/{id}` - Get specific backtest
- `GET /api/files/` - List uploaded files metadata
- `POST /api/files/upload/` - Upload file with metadata

## 🛠️ Technical Stack

- **Backend**: FastAPI, Python 3.11
- **Database**: SQLite + MongoDB
- **Frontend**: Vanilla JavaScript, Chart.js
- **Data Processing**: Pandas, NumPy
- **Strategy**: EMA Crossover with trailing stops

## 📝 Notes

- MongoDB automatically stores results after each successful backtest
- No manual intervention needed for data persistence
- All backtest data is preserved in MongoDB for historical analysis
- Frontend refreshes file list automatically every 30 seconds

## 🔄 To Restart Services

If you need to restart:

```bash
# Start MongoDB
mongod --dbpath /Users/ajinkya/Downloads/New\ folder/data/mongodb --bind_ip 127.0.0.1

# Start Backend (in another terminal)
python run.py
```

Then access the frontend at http://localhost:8000

---

**Status**: ✅ All systems operational and ready for use!
