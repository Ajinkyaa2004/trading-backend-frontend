from setuptools import setup, find_packages

setup(
    name="trading_backtest",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        'fastapi>=0.115.2',
        'uvicorn>=0.30.6',
        'pandas>=2.2.2',
        'numpy>=1.26.4',
        'SQLAlchemy>=2.0.34',
        'aiofiles>=23.2.1',
        'python-multipart>=0.0.9',
        'pydantic>=2.9.2',
        'plotly>=5.24.1',
        'tqdm>=4.66.5',
        'pymongo>=4.6.3',
        'motor>=3.3.2'
    ],
)
