// BACKEND: Express server with extended Reminder Support (uses .env for Mongo URI)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas using environment variable
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const taskStepSchema = new mongoose.Schema({
  title: String,
  completed: { type: Boolean, default: false },
});

const taskSchema = new mongoose.Schema({
  title: String,
  description: String,
  dueDate: Date,
  completed: { type: Boolean, default: false },
  steps: [taskStepSchema],
  reminderCount: { type: Number, default: 1 },
  reminderDaysBefore: { type: Number, default: 1 },
  recipients: [String],
});

const Task = mongoose.model('Task', taskSchema);

// Routes
app.post('/tasks', async (req, res) => {
  const task = new Task(req.body);
  await task.save();
  res.send(task);
});

app.put('/tasks/:id/edit', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.send(task);
});

app.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.send({ success: true });
});

app.get('/tasks', async (req, res) => {
  const tasks = await Task.find();
  res.send(tasks);
});

app.get('/tasks/status/:status', async (req, res) => {
  const status = req.params.status;
  const now = new Date();
  let tasks;

  if (status === 'pending') {
    tasks = await Task.find({ completed: false, dueDate: { $gte: now } });
  } else if (status === 'overdue') {
    tasks = await Task.find({ completed: false, dueDate: { $lt: now } });
  } else if (status === 'completed') {
    tasks = await Task.find({ completed: true });
  } else {
    return res.status(400).send({ error: 'Invalid status' });
  }

  res.send(tasks);
});

// Get tasks due in next X days for reminders
app.get('/tasks/reminders/upcoming', async (req, res) => {
  const now = new Date();
  const tasks = await Task.find({ completed: false });

  const dueSoon = tasks.filter(task => {
    const daysBefore = task.reminderDaysBefore || 1;
    const targetDate = new Date(task.dueDate);
    const diffInDays = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
    return diffInDays <= daysBefore && diffInDays >= 0;
  });

  res.send(dueSoon);
});

app.put('/tasks/:id/complete', async (req, res) => {
  const task = await Task.findById(req.params.id);
  task.completed = true;
  task.steps.forEach(step => step.completed = true);
  await task.save();
  res.send(task);
});

app.put('/tasks/:id/step/:stepIndex/complete', async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (task && task.steps[req.params.stepIndex]) {
    task.steps[req.params.stepIndex].completed = true;
    await task.save();
    res.send(task);
  } else {
    res.status(404).send({ error: 'Step not found' });
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
