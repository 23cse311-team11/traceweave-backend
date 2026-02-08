import mongoose from 'mongoose';

const connectMongo = async () => {
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;

  if (!mongoUri) {
    console.error('❌ MONGO_URI or MONGO_URL is not defined in environment variables');
    console.log('Available environment variables:', Object.keys(process.env).filter(k => k.includes('MONGO') || k.includes('URI') || k.includes('URL')));
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true
    });
    console.log('✅ MongoDB Atlas Connected (Logs & History)');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

export default connectMongo;