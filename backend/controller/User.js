const User = require("../models/User");
const AddUser = async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json({ user });
};
const getUserDetails = async (req, res) => {
  //   const user = await User.findById(req.params.id);
  const user = await User.findById(req.user._id).select("-password");
  res.status(200).json({ user });
};
const login = async (req, res) => {
  const { email, password } = req.body;
  console.log(email);
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }
  const isMatch = await user.checkPassword(password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid credentials" });
  } else {
    const token = user.generateAuthToken();
    res.status(200).json({ token });
  }
};
module.exports = { AddUser, getUserDetails, login };
