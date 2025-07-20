const jwt = require('jsonwebtoken');
const constants = require('../config/constants');
const sintracapFounder = require('../../models/sintracapFounder');
const sintracapInvestor = require('../../models/sintracapInvestor');

/**
 * Middleware to authenticate JWT token
 * Adapted for Azure Functions context
 */
const authenticateToken = async (context, req) => {
  try {

    // Extract token from headers
    const authHeader = req.headers['authorization'] || req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Get the token part

    if (!token) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: "Access token is required",
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      return false;
    }

    // Verify the token
    const decoded = jwt.verify(token, constants.JWT_SECRET);
    if(decoded.role == "admin") {
      const currentUser = {
        _id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role
      };
    // Attach user to the request for other functions to use
    return currentUser;
    }
    // Fetch user details from the database
    let sintracapUser = await sintracapFounder.findById(decoded.userId).select("-password");
    if(!sintracapUser) {
      sintracapUser = await sintracapInvestor.findById(decoded.userId).select("-password");
    }
    if (!sintracapUser) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: "User not found",
        },
        headers: {
          'Content-Type': 'application/json'
        }
      };
      return null;
    }
    const currentUser = {
      _id: sintracapUser._id.toString(),
      email: sintracapUser.email,
      name: sintracapUser.name,
      role: sintracapUser.role,
    };
    // Attach user to the request for other functions to use
    return currentUser;
  } catch (error) {
    context.log.error("JWT Verification Error:", error.message);

    context.res = {
      status: 403,
      body: {
        success: false,
        message: "Invalid or expired token",
      },
      headers: {
        'Content-Type': 'application/json'
      }
    };
    return null;
  }
};

module.exports = authenticateToken;
