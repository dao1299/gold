const express = require('express');
const axios = require('axios');
const path = require('path');
const xml2js = require('xml2js');

const app = express();

// BTMC API URL
const BTMC_API_URL = 'https://btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v';

// DANH SÁCH SẢN PHẨM
const SELECTED_PRODUCTS = [
    'NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)',
    'VÀNG MIẾNG SJC (Vàng SJC)',
    'QUÀ MỪNG BẢN VỊ VÀNG (Quà Mừng Bản Vị Vàng)'
];

// LƯU LỊCH SỬ GIÁ TRONG MEMORY
let priceHistoryMemory = {};

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// CẬP NHẬT LỊCH SỬ GIÁ
function updatePriceHistoryMemory(goldData) {
    const timestamp = new Date().toISOString();
    
    goldData.forEach(item => {
        if (!priceHistoryMemory[item.name]) {
            priceHistoryMemory[item.name] = [];
        }
        
        priceHistoryMemory[item.name].push({
            timestamp: timestamp,
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice,
            updateTime: item.updateTime
        });
        
        if (priceHistoryMemory[item.name].length > 144) {
            priceHistoryMemory[item.name] = priceHistoryMemory[item.name].slice(-144);
        }
    });
    
    return priceHistoryMemory;
}

// PARSE XML DATA
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
                        
                        if (!latestPrices.has(goldKey) || latestPrices.get(goldKey).row > goldItem.row) {
                            latestPrices.set(goldKey, goldItem);
                        }
                    }
                }
            });
            
            const finalResults = SELECTED_PRODUCTS
                .map(productName => latestPrices.get(productName))
                .filter(item => item !== undefined)
                .map(item => {
                    const { row, ...goldData } = item;
                    return goldData;
                });
            
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

function createSampleData() {
    return [
        {
            name: 'NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11350000,
            sellPrice: 11650000,
            refPrice: 0,
            updateTime: new Date().toLocaleString('vi-VN')
        },
        {
            name: 'VÀNG MIẾNG SJC (Vàng SJC)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11580000,
            sellPrice: 11780000,
            refPrice: 0,
            updateTime: new Date().toLocaleString('vi-VN')
        },
        {
            name: 'QUÀ MỪNG BẢN VỊ VÀNG (Quà Mừng Bản Vị Vàng)',
            karat: '24k',
            purity: '999.9',
            buyPrice: 11350000,
            sellPrice: 11650000,
            refPrice: 0,
            updateTime: new Date().toLocaleString('vi-VN')
        }
    ];
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
        let finalGoldData = goldData;
        
        if (goldData.length === 0) {
            finalGoldData = createSampleData();
        } else {
            updatePriceHistoryMemory(goldData);
        }
        
        res.render('index', {
            title: 'Giá Vàng BTMC - 3 Sản Phẩm Chính',
            goldData: finalGoldData,
            priceHistory: priceHistoryMemory,
            lastUpdate: new Date().toLocaleString('vi-VN'),
            error: null,
            formatCurrency: formatCurrency
        });
        
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
        
        const sampleData = createSampleData();
        
        res.render('index', {
            title: 'Giá Vàng BTMC - 3 Sản Phẩm Chính',
            goldData: sampleData,
            priceHistory: priceHistoryMemory,
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
        let finalGoldData = goldData;
        
        if (goldData.length === 0) {
            finalGoldData = createSampleData();
        } else {
            updatePriceHistoryMemory(goldData);
        }
        
        res.json({
            success: true,
            data: finalGoldData,
            history: priceHistoryMemory,
            lastUpdate: new Date().toISOString(),
            count: finalGoldData.length
        });
        
    } catch (error) {
        console.error('API Error:', error.message);
        
        const sampleData = createSampleData();
        
        res.json({
            success: false,
            data: sampleData,
            history: priceHistoryMemory,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString()
    });
});

// Export cho Vercel
module.exports = app;
