const express = require('express');
const axios = require('axios');
const path = require('path');
const xml2js = require('xml2js');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// BTMC API URL
const BTMC_API_URL = 'https://btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v';

// DANH SÁCH SẢN PHẨM MUỐN HIỂN THỊ
const SELECTED_PRODUCTS = [
    'NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)',
    'VÀNG MIẾNG SJC (Vàng SJC)',
    'QUÀ MỪNG BẢN VỊ VÀNG (Quà Mừng Bản Vị Vàng)'
];

// FILE LƯU LỊCH SỬ GIÁ
const PRICE_HISTORY_FILE = path.join(__dirname, 'data', 'price_history.json');

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// TẠO THƯ MỤC DATA NỀU CHƯA CÓ
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    } catch (error) {
        console.log('Data directory already exists or created');
    }
}

// ĐỌC LỊCH SỬ GIÁ
async function loadPriceHistory() {
    try {
        const data = await fs.readFile(PRICE_HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('No existing price history, starting fresh');
        return {};
    }
}

// LƯU LỊCH SỬ GIÁ
async function savePriceHistory(history) {
    try {
        await fs.writeFile(PRICE_HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error saving price history:', error);
    }
}

// CẬP NHẬT LỊCH SỬ GIÁ
async function updatePriceHistory(goldData) {
    const history = await loadPriceHistory();
    const timestamp = new Date().toISOString();
    
    goldData.forEach(item => {
        if (!history[item.name]) {
            history[item.name] = [];
        }
        
        // Thêm điểm dữ liệu mới
        history[item.name].push({
            timestamp: timestamp,
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice,
            updateTime: item.updateTime
        });
        
        // Chỉ giữ lại dữ liệu của 24 giờ gần nhất (144 điểm x 10 phút)
        if (history[item.name].length > 144) {
            history[item.name] = history[item.name].slice(-144);
        }
    });
    
    await savePriceHistory(history);
    return history;
}

// FUNCTION PARSE XML DATA - CẬP NHẬT ĐỂ LỌC SẢN PHẨM
async function parseXMLData(xmlString) {
    try {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlString);
        
        if (result && result.DataList && result.DataList.Data) {
            const dataArray = result.DataList.Data;
            const latestPrices = new Map();
            
            dataArray.forEach(item => {
                const attributes = item.$;
                if (attributes) {
                    const row = attributes.row;
                    const name = attributes[`n_${row}`];
                    
                    // CHỈ XỬ LÝ CÁC SẢN PHẨM TRONG DANH SÁCH
                    if (name && SELECTED_PRODUCTS.includes(name)) {
                        const karat = attributes[`k_${row}`];
                        const purity = attributes[`h_${row}`];
                        const buyPrice = attributes[`pb_${row}`];
                        const sellPrice = attributes[`ps_${row}`];
                        const refPrice = attributes[`pt_${row}`];
                        const updateTime = attributes[`d_${row}`];
                        
                        const goldKey = name.trim();
                        
                        const goldItem = {
                            name: name,
                            karat: karat || '24k',
                            purity: purity || '999.9',
                            buyPrice: parsePrice(buyPrice),
                            sellPrice: parsePrice(sellPrice),
                            refPrice: parsePrice(refPrice),
                            updateTime: updateTime || '',
                            row: parseInt(row)
                        };
                        
                        // Chỉ lưu giá mới nhất
                        if (!latestPrices.has(goldKey) || latestPrices.get(goldKey).row > goldItem.row) {
                            latestPrices.set(goldKey, goldItem);
                        }
                    }
                }
            });
            
            // SẮP XẾP THEO THỨ TỰ TRONG SELECTED_PRODUCTS
            const finalResults = SELECTED_PRODUCTS
                .map(productName => latestPrices.get(productName))
                .filter(item => item !== undefined)
                .map(item => {
                    const { row, ...goldData } = item;
                    return goldData;
                });
            
            console.log('Filtered results count:', finalResults.length);
            return finalResults;
        }
        
        return [];
        
    } catch (error) {
        console.error('Error parsing XML:', error);
        return [];
    }
}

function parseGoldData(rawData) {
    if (typeof rawData === 'string') {
        return parseXMLData(rawData);
    }
    return [];
}

function parsePrice(priceString) {
    if (!priceString || priceString === '0') return 0;
    const cleanPrice = priceString.toString().replace(/[^\d]/g, '');
    return parseInt(cleanPrice) || 0;
}

function formatCurrency(amount) {
    if (!amount || amount === 0) return 'Liên hệ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// ROUTES
app.get('/', async (req, res) => {
    try {
        console.log('Fetching data from BTMC API...');
        const response = await axios.get(BTMC_API_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/xml, text/xml, */*'
            }
        });
        
        const goldData = await parseGoldData(response.data);
        
        // Cập nhật lịch sử giá
        const priceHistory = await updatePriceHistory(goldData);
        
        let finalGoldData = goldData;
        if (goldData.length === 0) {
            finalGoldData = createSampleData();
        }
        
        res.render('index', {
            title: 'Giá Vàng BTMC - 3 Sản Phẩm Chính',
            goldData: finalGoldData,
            priceHistory: priceHistory,
            lastUpdate: new Date().toLocaleString('vi-VN'),
            error: null,
            formatCurrency: formatCurrency
        });
        
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
        
        const sampleData = createSampleData();
        const priceHistory = await loadPriceHistory();
        
        res.render('index', {
            title: 'Giá Vàng BTMC - 3 Sản Phẩm Chính',
            goldData: sampleData,
            priceHistory: priceHistory,
            lastUpdate: null,
            error: `Lỗi kết nối API: ${error.message}`,
            formatCurrency: formatCurrency
        });
    }
});

// API ENDPOINT
app.get('/api/gold-prices', async (req, res) => {
    try {
        const response = await axios.get(BTMC_API_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/xml, text/xml, */*'
            }
        });
        
        const goldData = await parseGoldData(response.data);
        const priceHistory = await updatePriceHistory(goldData);
        
        let finalGoldData = goldData;
        if (goldData.length === 0) {
            finalGoldData = createSampleData();
        }
        
        res.json({
            success: true,
            data: finalGoldData,
            history: priceHistory,
            lastUpdate: new Date().toISOString(),
            count: finalGoldData.length
        });
        
    } catch (error) {
        console.error('API Error:', error.message);
        
        const sampleData = createSampleData();
        const priceHistory = await loadPriceHistory();
        
        res.json({
            success: false,
            data: sampleData,
            history: priceHistory,
            error: error.message
        });
    }
});

// API LẤY LỊCH SỬ GIÁ
app.get('/api/price-history/:productName?', async (req, res) => {
    try {
        const history = await loadPriceHistory();
        const productName = req.params.productName;
        
        if (productName) {
            // Trả về lịch sử của 1 sản phẩm cụ thể
            const decodedName = decodeURIComponent(productName);
            res.json({
                success: true,
                productName: decodedName,
                data: history[decodedName] || []
            });
        } else {
            // Trả về lịch sử của tất cả sản phẩm
            res.json({
                success: true,
                data: history
            });
        }
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

function createSampleData() {
    return [
        {
            name: 'NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11350000,
            sellPrice: 11650000,
            refPrice: 0,
            updateTime: '02/06/2025 14:40'
        },
        {
            name: 'VÀNG MIẾNG SJC (Vàng SJC)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11580000,
            sellPrice: 11780000,
            refPrice: 0,
            updateTime: '02/06/2025 14:40'
        },
        {
            name: 'QUÀ MỪNG BẢN VỊ VÀNG (Quà Mừng Bản Vị Vàng)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11350000,
            sellPrice: 11650000,
            refPrice: 0,
            updateTime: '02/06/2025 14:40'
        }
    ];
}

// KHỞI TẠO VÀ CHẠY SERVER
async function startServer() {
    await ensureDataDirectory();
    
    // Tự động cập nhật giá mỗi 10 phút
    setInterval(async () => {
        try {
            console.log('Auto-updating prices...');
            const response = await axios.get(BTMC_API_URL, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/xml, text/xml, */*'
                }
            });
            
            const goldData = await parseGoldData(response.data);
            if (goldData.length > 0) {
                await updatePriceHistory(goldData);
                console.log('Prices updated successfully');
            }
        } catch (error) {
            console.error('Auto-update error:', error.message);
        }
    }, 10 * 60 * 1000); // 10 phút
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📊 API endpoint: http://localhost:${PORT}/api/gold-prices`);
        console.log(`📈 Price history: http://localhost:${PORT}/api/price-history`);
        console.log(`⏰ Auto-update every 10 minutes`);
    });
}

startServer();
