// Global variables
let historicalData = [];
let currentStrategyId = null;
let chart = null;

// DOM Elements
const resultsContainer = document.getElementById('results');
const loadingElement = document.getElementById('loading');
const noResultsElement = document.getElementById('noResults');
const errorStateElement = document.getElementById('errorState');
const errorMessageElement = document.getElementById('errorMessage');
const retryButton = document.getElementById('retryButton');
const strategyFilter = document.getElementById('strategyFilter');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyFiltersButton = document.getElementById('applyFilters');
const viewModal = document.getElementById('viewModal');
const closeModalButton = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const modalParams = document.getElementById('modalParams');
const modalMetrics = document.getElementById('modalMetrics');
const tradesBody = document.getElementById('tradesBody');
const exportJsonButton = document.getElementById('exportJson');
const deleteStrategyButton = document.getElementById('deleteStrategy');

// API Base URL
const API_BASE_URL = 'http://localhost:8000/api';

// Initialize the page
async function init() {
    setupEventListeners();
    await loadHistoricalData();
}

// Set up event listeners
function setupEventListeners() {
    // Filter controls
    applyFiltersButton.addEventListener('click', handleFilterSubmit);
    retryButton.addEventListener('click', loadHistoricalData);
    
    // Modal controls
    closeModalButton.addEventListener('click', () => viewModal.classList.add('hidden'));
    viewModal.addEventListener('click', (e) => {
        if (e.target === viewModal) viewModal.classList.add('hidden');
    });
    
    // Strategy actions
    exportJsonButton.addEventListener('click', exportStrategyAsJson);
    deleteStrategyButton.addEventListener('click', confirmDeleteStrategy);
}

// Load historical data from the API
async function loadHistoricalData() {
    try {
        showLoading();
        
        // Prepare query parameters
        const params = new URLSearchParams();
        if (strategyFilter.value) params.append('strategy_name', strategyFilter.value);
        if (startDateInput.value) params.append('start_date', startDateInput.value);
        if (endDateInput.value) params.append('end_date', endDateInput.value);
        
        const response = await fetch(`${API_BASE_URL}/historical-data/?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        historicalData = await response.json();
        
        // Update UI
        updateStrategyFilter(historicalData);
        renderStrategyCards(historicalData);
        
        if (historicalData.length === 0) {
            showNoResults();
        } else {
            hideLoading();
        }
    } catch (error) {
        console.error('Error loading historical data:', error);
        showError(`Failed to load data: ${error.message}`);
    }
}

// Update the strategy filter dropdown with unique strategy names
function updateStrategyFilter(data) {
    const strategies = new Set(data.map(item => item.strategy_name));
    const currentValue = strategyFilter.value;
    
    // Clear existing options except the first one
    while (strategyFilter.options.length > 1) {
        strategyFilter.remove(1);
    }
    
    // Add new options
    strategies.forEach(strategy => {
        const option = document.createElement('option');
        option.value = strategy;
        option.textContent = strategy;
        strategyFilter.appendChild(option);
    });
    
    // Restore the selected value if it still exists
    if (currentValue && Array.from(strategyFilter.options).some(opt => opt.value === currentValue)) {
        strategyFilter.value = currentValue;
    }
}

// Render strategy cards in the results container
function renderStrategyCards(data) {
    resultsContainer.innerHTML = '';
    
    if (data.length === 0) {
        showNoResults();
        return;
    }
    
    data.forEach(strategy => {
        const card = createStrategyCard(strategy);
        resultsContainer.appendChild(card);
    });
}

// Create a strategy card element
function createStrategyCard(strategy) {
    const card = document.createElement('div');
    card.className = 'strategy-card bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition';
    card.setAttribute('data-id', strategy._id);
    
    // Format date
    const date = new Date(strategy.timestamp);
    const dateString = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Get the main metric (e.g., Sharpe ratio or PnL)
    const mainMetric = strategy.metrics?.sharpe_ratio !== undefined ? 
        `Sharpe: ${strategy.metrics.sharpe_ratio.toFixed(2)}` : 
        `PnL: ${strategy.metrics?.total_pnl?.toFixed(2) || 'N/A'}`;
    
    // Determine badge color based on performance
    let badgeClass = 'badge-success';
    if (strategy.metrics?.sharpe_ratio < 0) {
        badgeClass = 'badge-error';
    } else if (strategy.metrics?.sharpe_ratio < 1) {
        badgeClass = 'badge-warning';
    }
    
    card.innerHTML = `
        <div class="p-5">
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-lg font-semibold text-gray-800">${strategy.strategy_name}</h3>
                <span class="${badgeClass} badge">${mainMetric}</span>
            </div>
            <p class="text-sm text-gray-600 mb-3">${dateString}</p>
            
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-700 mb-4">
                <div>
                    <span class="font-medium">Trades:</span> 
                    <span>${strategy.trades?.length || 0}</span>
                </div>
                <div>
                    <span class="font-medium">Win Rate:</span> 
                    <span>${strategy.metrics?.win_rate ? (strategy.metrics.win_rate * 100).toFixed(1) + '%' : 'N/A'}</span>
                </div>
                <div>
                    <span class="font-medium">Max Drawdown:</span> 
                    <span>${strategy.metrics?.max_drawdown ? (strategy.metrics.max_drawdown * 100).toFixed(1) + '%' : 'N/A'}</span>
                </div>
                <div>
                    <span class="font-medium">Duration:</span> 
                    <span>${strategy.metrics?.duration_days || 'N/A'} days</span>
                </div>
            </div>
            
            <button class="view-details w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
                View Details
            </button>
        </div>
    `;
    
    // Add click handler for the view details button
    card.querySelector('.view-details').addEventListener('click', () => {
        showStrategyDetails(strategy._id);
    });
    
    return card;
}

// Show strategy details in the modal
async function showStrategyDetails(strategyId) {
    try {
        showLoading();
        
        const strategy = historicalData.find(s => s._id === strategyId);
        if (!strategy) {
            throw new Error('Strategy not found');
        }
        
        currentStrategyId = strategyId;
        
        // Update modal title
        modalTitle.textContent = `${strategy.strategy_name} - ${new Date(strategy.timestamp).toLocaleString()}`;
        
        // Render parameters
        modalParams.innerHTML = '';
        if (strategy.parameters) {
            for (const [key, value] of Object.entries(strategy.parameters)) {
                const paramElement = document.createElement('div');
                paramElement.className = 'mb-2';
                paramElement.innerHTML = `
                    <div class="text-sm text-gray-600">${formatKey(key)}</div>
                    <div class="text-gray-800 font-medium">${formatValue(value)}</div>
                `;
                modalParams.appendChild(paramElement);
            }
        } else {
            modalParams.innerHTML = '<p class="text-gray-500">No parameters available</p>';
        }
        
        // Render metrics
        modalMetrics.innerHTML = '';
        if (strategy.metrics) {
            for (const [key, value] of Object.entries(strategy.metrics)) {
                const metricElement = document.createElement('div');
                metricElement.className = 'mb-2';
                
                let displayValue = formatValue(value);
                
                // Special formatting for percentage values
                if (key.toLowerCase().includes('percent') || key.toLowerCase().includes('rate') || key.toLowerCase().includes('drawdown')) {
                    displayValue = (Number(value) * 100).toFixed(2) + '%';
                }
                
                // Special formatting for monetary values
                if (key.toLowerCase().includes('pnl') || key.toLowerCase().includes('profit') || key.toLowerCase().includes('return')) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        displayValue = numValue.toFixed(2);
                        if (numValue > 0) {
                            displayValue = `+$${displayValue}`;
                        } else if (numValue < 0) {
                            displayValue = `-$${Math.abs(numValue).toFixed(2)}`;
                        }
                    }
                }
                
                metricElement.innerHTML = `
                    <div class="text-sm text-gray-600">${formatKey(key)}</div>
                    <div class="text-gray-800 font-medium">${displayValue}</div>
                `;
                modalMetrics.appendChild(metricElement);
            }
        } else {
            modalMetrics.innerHTML = '<p class="text-gray-500">No metrics available</p>';
        }
        
        // Render trades table
        renderTradesTable(strategy.trades || []);
        
        // Render equity curve chart
        renderEquityChart(strategy.equity_curve || []);
        
        // Show the modal
        viewModal.classList.remove('hidden');
        hideLoading();
        
    } catch (error) {
        console.error('Error showing strategy details:', error);
        showError(`Failed to load strategy details: ${error.message}`);
    }
}

// Render trades table
function renderTradesTable(trades) {
    tradesBody.innerHTML = '';
    
    if (!trades || trades.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" class="px-4 py-8 text-center text-gray-500">No trades available</td>';
        tradesBody.appendChild(row);
        return;
    }
    
    trades.forEach(trade => {
        const row = document.createElement('tr');
        
        // Format P&L with color
        let pnlClass = '';
        if (trade.pnl > 0) {
            pnlClass = 'text-green-600';
        } else if (trade.pnl < 0) {
            pnlClass = 'text-red-600';
        }
        
        // Calculate return percentage if not provided
        const returnPct = trade.return_pct !== undefined ? 
            (trade.return_pct * 100).toFixed(2) + '%' : 
            (trade.entry_price ? ((trade.exit_price - trade.entry_price) / trade.entry_price * 100).toFixed(2) + '%' : 'N/A');
        
        row.innerHTML = `
            <td class="px-4 py-2 text-sm">${formatDate(trade.entry_time)}</td>
            <td class="px-4 py-2 text-sm">${formatDate(trade.exit_time)}</td>
            <td class="px-4 py-2 text-sm text-right font-medium ${pnlClass}">
                ${trade.pnl > 0 ? '+' : ''}${trade.pnl?.toFixed(2) || 'N/A'}
            </td>
            <td class="px-4 py-2 text-sm text-right font-medium ${pnlClass}">
                ${returnPct}
            </td>
        `;
        
        tradesBody.appendChild(row);
    });
}

// Render equity curve chart
function renderEquityChart(equityCurve) {
    const ctx = document.getElementById('equityChart').getContext('2d');
    
    // Destroy previous chart if it exists
    if (chart) {
        chart.destroy();
    }
    
    if (!equityCurve || equityCurve.length === 0) {
        return;
    }
    
    // Prepare data for Chart.js
    const labels = equityCurve.map((point, index) => {
        if (point.date) {
            return new Date(point.date).toLocaleDateString();
        }
        return index + 1;
    });
    
    const data = equityCurve.map(point => point.value || point.equity || point.balance);
    
    // Create the chart
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Equity Curve',
                data: data,
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Equity'
                    }
                }
            }
        }
    });
}

// Export strategy as JSON
function exportStrategyAsJson() {
    if (!currentStrategyId) return;
    
    const strategy = historicalData.find(s => s._id === currentStrategyId);
    if (!strategy) return;
    
    const dataStr = JSON.stringify(strategy, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `strategy_${strategy.strategy_name}_${new Date(strategy.timestamp).toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Confirm before deleting a strategy
function confirmDeleteStrategy() {
    if (!currentStrategyId) return;
    
    if (confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
        deleteStrategy(currentStrategyId);
    }
}

// Delete a strategy
async function deleteStrategy(strategyId) {
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/historical-data/${strategyId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Remove the strategy from the UI
        const card = document.querySelector(`[data-id="${strategyId}"]`);
        if (card) {
            card.remove();
        }
        
        // Remove from the historical data array
        historicalData = historicalData.filter(s => s._id !== strategyId);
        
        // Close the modal
        viewModal.classList.add('hidden');
        
        // Show success message
        alert('Strategy deleted successfully');
        
        // Reload the data to update the UI
        await loadHistoricalData();
        
    } catch (error) {
        console.error('Error deleting strategy:', error);
        showError(`Failed to delete strategy: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Handle filter form submission
async function handleFilterSubmit(e) {
    e.preventDefault();
    await loadHistoricalData();
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

// Helper function to format object keys for display
function formatKey(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, c => c.toUpperCase());
}

// Helper function to format values for display
function formatValue(value) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return value.toString();
}

// UI State Management
function showLoading() {
    loadingElement.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    noResultsElement.classList.add('hidden');
    errorStateElement.classList.add('hidden');
}

function hideLoading() {
    loadingElement.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
}

function showNoResults() {
    loadingElement.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    noResultsElement.classList.remove('hidden');
    errorStateElement.classList.add('hidden');
}

function showError(message) {
    loadingElement.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    noResultsElement.classList.add('hidden');
    errorStateElement.classList.remove('hidden');
    errorMessageElement.textContent = message;
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
