const { AddUser, getUserDetails, login } = require("../controller/User");

const router = require("express").Router();

router.post("/signup", AddUser);
router.get("/user", getUserDetails);
router.post("/login", login);
module.exports = router;
