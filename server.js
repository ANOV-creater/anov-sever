const express = require('express');
const path = require('path');
const webpush = require('web-push');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware for parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: 'anov-designer-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'assets', 'posts', req.session.designerId || 'temp');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Configure web-push with VAPID keys
webpush.setVapidDetails(
    'mailto:your-email@example.com',
    'BEl62iUYgUivxIkv69yViEuiBIa40HI80UNIOuUBNgAFGlfuV4gEPSKChN5bj2EcPqv9hgpKYp4Kyt5j6Cp-nqI', // Public key
    'bNxX5A9Q7u8-6Z7J2P3mK5L8vW9xR4T1yU2I5oP7sA3' // Private key (this is just an example, generate your own)
);

// In-memory storage for subscriptions (use database in production)
let subscriptions = [];
let scheduledNotifications = [];

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve assets with proper headers
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxAge: '1d', // Cache for 1 day
    setHeaders: (res, path) => {
        if (path.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
        } else if (path.endsWith('.otf') || path.endsWith('.ttf')) {
            res.setHeader('Content-Type', 'font/opentype');
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (path.endsWith('.woff') || path.endsWith('.woff2')) {
            res.setHeader('Content-Type', 'font/woff');
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
    }
}));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.designerId) {
        next();
    } else {
        res.status(401).json({ error: '로그인이 필요합니다.' });
    }
}

// Helper functions
function loadDesignerAccounts() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'assets', 'auth', 'designer-accounts.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading designer accounts:', error);
        return { accounts: [] };
    }
}

function loadDesignerSchedules() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'assets', 'data', 'designer-schedules.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading designer schedules:', error);
        return { schedules: {} };
    }
}

function saveDesignerSchedules(schedules) {
    try {
        fs.writeFileSync(
            path.join(__dirname, 'assets', 'data', 'designer-schedules.json'),
            JSON.stringify(schedules, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving designer schedules:', error);
        return false;
    }
}

function loadDesignerPosts() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'assets', 'data', 'designer-posts.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading designer posts:', error);
        return { posts: [] };
    }
}

function saveDesignerPosts(posts) {
    try {
        fs.writeFileSync(
            path.join(__dirname, 'assets', 'data', 'designer-posts.json'),
            JSON.stringify(posts, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Error saving designer posts:', error);
        return false;
    }
}

// Route for main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Designer login page
app.get('/designer-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'designer-login.html'));
});

// Designer dashboard
app.get('/designer-dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'designer-dashboard.html'));
});

// Authentication APIs
app.post('/api/designer/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }
    
    const accounts = loadDesignerAccounts();
    const designer = accounts.accounts.find(acc => acc.email === email && acc.isActive);
    
    if (!designer) {
        return res.status(401).json({ error: '존재하지 않는 계정입니다.' });
    }
    
    // Simple password check (in production, use bcrypt)
    if (designer.password !== password) {
        return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    
    // Set session
    req.session.designerId = designer.id;
    req.session.designerName = designer.name;
    req.session.designerEmail = designer.email;
    
    res.json({ 
        success: true, 
        designer: {
            id: designer.id,
            name: designer.name,
            email: designer.email,
            floor: designer.floor,
            role: designer.role
        }
    });
});

app.post('/api/designer/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' });
        }
        res.json({ success: true });
    });
});

// Get current designer info
app.get('/api/designer/me', requireAuth, (req, res) => {
    res.json({
        id: req.session.designerId,
        name: req.session.designerName,
        email: req.session.designerEmail
    });
});

// Schedule management APIs
app.get('/api/designer/schedule', requireAuth, (req, res) => {
    const schedules = loadDesignerSchedules();
    const designerSchedule = schedules.schedules[req.session.designerId] || {
        workingHours: {
            monday: [], tuesday: [], wednesday: [], thursday: [],
            friday: [], saturday: [], sunday: []
        },
        holidays: [],
        lastUpdated: new Date().toISOString()
    };
    
    res.json(designerSchedule);
});

app.post('/api/designer/schedule', requireAuth, (req, res) => {
    const { workingHours, holidays } = req.body;
    
    if (!workingHours) {
        return res.status(400).json({ error: '근무 시간 정보가 필요합니다.' });
    }
    
    const schedules = loadDesignerSchedules();
    
    schedules.schedules[req.session.designerId] = {
        workingHours,
        holidays: holidays || [],
        lastUpdated: new Date().toISOString()
    };
    
    if (saveDesignerSchedules(schedules)) {
        res.json({ success: true, message: '스케줄이 저장되었습니다.' });
    } else {
        res.status(500).json({ error: '스케줄 저장 중 오류가 발생했습니다.' });
    }
});

// Post management APIs
app.get('/api/designer/posts', requireAuth, (req, res) => {
    const posts = loadDesignerPosts();
    const designerPosts = posts.posts.filter(post => post.designerId === req.session.designerId);
    
    res.json(designerPosts);
});

app.post('/api/designer/posts', requireAuth, upload.array('images', 5), (req, res) => {
    const { title, content, tags } = req.body;
    
    if (!title || !content) {
        return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
    }
    
    const posts = loadDesignerPosts();
    
    const newPost = {
        id: `post_${Date.now()}`,
        designerId: req.session.designerId,
        title,
        content,
        images: req.files ? req.files.map(file => `/assets/posts/${req.session.designerId}/${file.filename}`) : [],
        createdAt: new Date().toISOString(),
        isPublished: true,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    };
    
    posts.posts.push(newPost);
    
    if (saveDesignerPosts(posts)) {
        res.json({ success: true, post: newPost });
    } else {
        res.status(500).json({ error: '게시글 저장 중 오류가 발생했습니다.' });
    }
});

app.delete('/api/designer/posts/:postId', requireAuth, (req, res) => {
    const { postId } = req.params;
    const posts = loadDesignerPosts();
    
    const postIndex = posts.posts.findIndex(post => 
        post.id === postId && post.designerId === req.session.designerId
    );
    
    if (postIndex === -1) {
        return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }
    
    posts.posts.splice(postIndex, 1);
    
    if (saveDesignerPosts(posts)) {
        res.json({ success: true, message: '게시글이 삭제되었습니다.' });
    } else {
        res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
    }
});

// API endpoints for future booking functionality
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'JUNO HAIR Booking Server is running',
        timestamp: new Date().toISOString()
    });
});

// Placeholder for booking endpoints
app.post('/api/book/new', (req, res) => {
    res.json({ 
        message: 'New user booking endpoint - not implemented yet',
        redirect: '/booking/new-user'
    });
});

app.post('/api/book/returning', (req, res) => {
    res.json({ 
        message: 'Returning user booking endpoint - not implemented yet',
        redirect: '/booking/returning-user'
    });
});

// === PUSH NOTIFICATION APIS ===

// Store push subscription
app.post('/api/push-subscription', (req, res) => {
    const { subscription, userInfo } = req.body;
    
    console.log('Received push subscription:', subscription);
    
    // Store subscription (in production, save to database)
    const subscriptionData = {
        subscription,
        userInfo,
        timestamp: Date.now()
    };
    
    // Remove existing subscription for same user if exists
    subscriptions = subscriptions.filter(sub => 
        sub.userInfo && sub.userInfo.email !== userInfo.email
    );
    
    // Add new subscription
    subscriptions.push(subscriptionData);
    
    console.log('Push subscription stored. Total subscriptions:', subscriptions.length);
    
    res.json({ success: true, message: 'Subscription stored successfully' });
});

// Schedule notification
app.post('/api/schedule-notification', (req, res) => {
    const { subscription, booking, scheduleTime } = req.body;
    
    console.log('Scheduling notification for booking:', booking.id);
    
    // Create notification data
    const notificationData = {
        subscription,
        booking,
        scheduleTime,
        payload: {
            title: 'JUNO HAIR 예약 알림',
            body: `내일 ${booking.time}에 ${booking.designer.name} 디자이너와 예약이 있습니다.`,
            icon: '/assets/images/logo.png',
            badge: '/assets/images/badge.png',
            data: {
                url: '/admin.html',
                bookingId: booking.id
            },
            actions: [
                {
                    action: 'view',
                    title: '예약 확인'
                },
                {
                    action: 'close',
                    title: '닫기'
                }
            ]
        }
    };
    
    // Store scheduled notification
    scheduledNotifications.push(notificationData);
    
    // Set timeout to send notification (simplified - use cron job in production)
    const delay = scheduleTime - Date.now();
    if (delay > 0) {
        setTimeout(() => {
            sendPushNotification(notificationData);
        }, delay);
        
        console.log(`Notification scheduled for ${new Date(scheduleTime)} (in ${Math.round(delay/1000/60)} minutes)`);
    } else {
        // Send immediately if scheduled time is in the past
        sendPushNotification(notificationData);
    }
    
    res.json({ success: true, message: 'Notification scheduled successfully' });
});

// API endpoint to send test notifications
app.post('/api/send-test-notification', (req, res) => {
    if (subscriptions.length === 0) {
        return res.status(404).json({ error: '등록된 구독자가 없습니다. 먼저 알림을 허용해주세요.' });
    }

    const testNotification = {
        id: 'test-' + Date.now(),
        time: Date.now(),
        payload: {
            title: '주노헤어 테스트 알림',
            body: '이것은 테스트 알림입니다. 알림이 정상적으로 작동합니다!',
            icon: '/assets/images/logo.png',
            badge: '/assets/images/logo.png',
            vibrate: [200, 100, 200],
            data: {
                url: '/step2.html',
                test: true
            },
            actions: [
                { action: 'view', title: '확인' },
                { action: 'close', title: '닫기' }
            ]
        }
    };

    // Send to all subscriptions
    let successCount = 0;
    let promises = subscriptions.map(subscriptionData => {
        return webpush.sendNotification(
            subscriptionData.subscription,
            JSON.stringify(testNotification.payload)
        )
        .then(() => { successCount++; })
        .catch(error => {
            console.error('테스트 알림 전송 중 오류:', error);
            if (error.statusCode === 410) {
                // Subscription has expired or is no longer valid
                const index = subscriptions.findIndex(sub => sub.subscription.endpoint === subscriptionData.subscription.endpoint);
                if (index !== -1) {
                    subscriptions.splice(index, 1);
                }
            }
            return null;
        });
    });

    Promise.all(promises)
        .then(() => {
            console.log(`🔔 테스트 알림 전송: ${successCount}/${subscriptions.length} 성공`);
            res.json({ 
                success: true,
                message: `${successCount}/${subscriptions.length} 구독자에게 테스트 알림을 전송했습니다.`
            });
        })
        .catch(error => {
            console.error('테스트 알림 전송 중 오류:', error);
            res.status(500).json({ error: '알림 전송 중 오류가 발생했습니다.' });
        });
});

// Get all subscriptions (for admin)
app.get('/api/subscriptions', (req, res) => {
    res.json({
        success: true,
        count: subscriptions.length,
        subscriptions: subscriptions.map(sub => ({
            userInfo: sub.userInfo,
            timestamp: sub.timestamp
        }))
    });
});

// Function to send push notification
function sendPushNotification(notificationData) {
    const { subscription, payload } = notificationData;
    
    console.log('Sending push notification:', payload.title);
    
    webpush.sendNotification(subscription, JSON.stringify(payload))
        .then(() => {
            console.log('Push notification sent successfully');
        })
        .catch(error => {
            console.error('Error sending push notification:', error);
            // Remove invalid subscription
            if (error.statusCode === 410) {
                console.log('Removing invalid subscription');
                subscriptions = subscriptions.filter(sub => 
                    JSON.stringify(sub.subscription) !== JSON.stringify(subscription)
                );
            }
        });
}

// Clean up expired scheduled notifications (run every hour)
setInterval(() => {
    const now = Date.now();
    const before = scheduledNotifications.length;
    scheduledNotifications = scheduledNotifications.filter(notification => 
        notification.scheduleTime > now - (24 * 60 * 60 * 1000) // Keep for 24 hours
    );
    const after = scheduledNotifications.length;
    if (before !== after) {
        console.log(`Cleaned up ${before - after} expired notifications`);
    }
}, 60 * 60 * 1000); // Every hour

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Page not found',
        message: 'The requested resource was not found on this server.'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: 'Something went wrong on our end.'
    });
});

app.listen(PORT, () => {
    console.log(`🔥 JUNO HAIR Booking Server is running on http://localhost:${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your mobile browser for best experience`);
});

module.exports = app;
