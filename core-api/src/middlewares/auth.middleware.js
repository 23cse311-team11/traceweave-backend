import jwt from 'jsonwebtoken';

const authenticateUser = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated', isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      ...decoded,
      id: decoded.id || decoded.sub,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token', isAuthenticated: false });
  }
};

export default authenticateUser;