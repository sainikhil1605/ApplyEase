const { AddUser, getUserDetails, login } = require("../controller/User");
const authMiddleware = require("../middleware/auth");

const router = require("express").Router();

router.post("/signup", AddUser);
router.get("/user", authMiddleware, getUserDetails);
router.post("/login", login);
module.exports = router;
