# FOOD SHOP — শুরু করার নির্দেশনা

এই প্রজেক্টে আছে:
- মোবাইল নম্বর + পাসওয়ার্ড দিয়ে রেজিস্ট্রেশন/লগইন
- পাসওয়ার্ড bcrypt দিয়ে hash করা
- Referral code
- পণ্য দেখা, সার্চ, ক্যাটাগরি ও কার্ট
- Cash on Delivery অর্ডার
- কাস্টমারের অর্ডার দেখা
- Admin order status management

## ১) GitHub-এ আপলোড
এই ZIP extract করে সব ফাইল GitHub repository-তে upload করো। `.env` ফাইল কখনো GitHub-এ দেবে না।

## ২) PostgreSQL database
Render-এ একটি PostgreSQL database তৈরি করো। তার Internal Database URL কপি করো।

## ৩) Render Web Service
GitHub repository connect করে Web Service তৈরি করো।
- Build Command: `npm install`
- Start Command: `npm start`

Environment Variables যোগ করো:
- `DATABASE_URL` = Render PostgreSQL Internal Database URL
- `JWT_SECRET` = অন্তত ৩২ অক্ষরের শক্তিশালী random secret
- `ADMIN_PHONE` = তোমার নিজের ১১ সংখ্যার বাংলাদেশি নম্বর (যে নম্বরে admin access দিতে চাও)
- `NODE_ENV` = `production`

প্রথমবার `ADMIN_PHONE` নম্বর দিয়ে Register করলে সেই অ্যাকাউন্ট admin হবে। নম্বরটি অন্য কাউকে দেবে না।

## ৪) গুরুত্বপূর্ণ
- এখন পেমেন্ট পদ্ধতি Cash on Delivery। bKash/Nagad automated payment চালু নেই।
- Product list আপাতত server.js-এ রাখা আছে; পরের ধাপে admin product management যোগ করা যাবে।
- Production চালুর আগে ব্যবসার প্রকৃত নাম-ঠিকানা, যোগাযোগ, delivery/return/refund policy, stock, price এবং privacy policy যোগ করো।
- OTP/phone ownership verification, password reset, CSRF protection, persistent session strategy, audit log এবং backup যোগ না করে বড় পরিসরে চালু কোরো না।
- JWT_SECRET, DATABASE_URL বা কোনো পাসওয়ার্ড কাউকে পাঠাবে না; GitHub-এ `.env` আপলোড করবে না।
- এটি একটি প্রাথমিক ব্যবসায়িক starter, সম্পূর্ণ audited production commerce platform নয়।
