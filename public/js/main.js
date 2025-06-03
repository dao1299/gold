// main.js
let isRefreshing = false;

// Format currency function
function formatCurrency(number) {
    if (!number || number === "0" || number === 0) return "Không niêm yết";
    return new Intl.NumberFormat('vi-VN').format(number) + ' VND';
}

// Refresh prices function
async function refreshPrices() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    const refreshBtn = document.querySelector('.refresh-btn');
    const loading = document.getElementById('loading');
    const goldGrid = document.getElementById('goldGrid');
    
    // Update button state
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
    
    // Show loading
    if (loading) loading.style.display = 'block';
    if (goldGrid) goldGrid.style.opacity = '0.5';
    
    try {
        const response = await fetch('/api/gold-prices');
        const result = await response.json();
        
        if (result.success && result.data.length > 0) {
            updateGoldGrid(result.data);
            updateStats(result.count, result.lastUpdate);
            showSuccessMessage(`Đã cập nhật ${result.count} sản phẩm vàng`);
        } else {
            throw new Error(result.error || 'Không có dữ liệu');
        }
        
    } catch (error) {
        console.error('Error refreshing prices:', error);
        showErrorMessage('Lỗi khi tải dữ liệu: ' + error.message);
    } finally {
        isRefreshing = false;
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Làm mới';
        
        if (loading) loading.style.display = 'none';
        if (goldGrid) goldGrid.style.opacity = '1';
    }
}

// Update gold grid
function updateGoldGrid(goldData) {
    const goldGrid = document.getElementById('goldGrid');
    if (!goldGrid) return;
    
    goldGrid.innerHTML = '';
    
    goldData.forEach(gold => {
        const card = document.createElement('div');
        card.className = 'gold-card';
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        card.innerHTML = `
            <div class="card-header">
                <i class="fas fa-gem"></i>
                <span>${gold.name}</span>
            </div>
            <div class="card-body">
                <div class="price-row">
                    <span class="price-label">Độ tinh khiết:</span>
                    <span class="price-value purity">${gold.karat} - ${gold.purity}‰</span>
                </div>
                <div class="price-row">
                    <span class="price-label">
                        <i class="fas fa-arrow-down text-success"></i>
                        Giá mua vào:
                    </span>
                    <span class="price-value buy-price">${formatCurrency(gold.buyPrice)}</span>
                </div>
                <div class="price-row">
                    <span class="price-label">
                        <i class="fas fa-arrow-up text-danger"></i>
                        Giá bán ra:
                    </span>
                    <span class="price-value sell-price">${formatCurrency(gold.sellPrice)}</span>
                </div>
                ${gold.updateTime ? `
                <div class="price-row">
                    <span class="price-label">
                        <i class="fas fa-clock"></i>
                        Cập nhật:
                    </span>
                    <span class="price-value update-time">${gold.updateTime}</span>
                </div>
                ` : ''}
            </div>
        `;
        
        goldGrid.appendChild(card);
        
        // Animate card appearance
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100);
    });
}

// Update stats
// Update stats (tiếp tục)
function updateStats(count, lastUpdate) {
    const productCount = document.getElementById('productCount');
    if (productCount) {
        productCount.textContent = count;
    }
    
    // Update last update time if element exists
    const lastUpdateElement = document.querySelector('.last-update');
    if (lastUpdateElement && lastUpdate) {
        const updateTime = new Date(lastUpdate).toLocaleString('vi-VN');
        lastUpdateElement.textContent = `Cập nhật lần cuối: ${updateTime}`;
    }
}

// Show success message
function showSuccessMessage(message) {
    showNotification(message, 'success');
}

// Show error message
function showErrorMessage(message) {
    showNotification(message, 'error');
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
}

// Auto refresh every 5 minutes
setInterval(() => {
    if (!isRefreshing) {
        refreshPrices();
    }
}, 5 * 60 * 1000);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Gold Price Website initialized');
    
    // Add smooth scrolling to all links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
