const {
  AddUser,
  getUserDetails,
  login,
  updateUserDetails,
  getResume,
} = require("../controller/User");
const authMiddleware = require("../middleware/auth");
const uploadMiddleware = require("../middleware/multerUpload");

const router = require("express").Router();

router.post("/signup", AddUser);
router.get("/user", authMiddleware, getUserDetails);
router.post("/login", login);
router.patch(
  "/user",
  authMiddleware,
  uploadMiddleware.single("resume"),
  updateUserDetails
);
router.get("/resume", authMiddleware, getResume);
module.exports = router;
