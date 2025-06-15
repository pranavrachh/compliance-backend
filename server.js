// BACKEND: Express server with extended Reminder Support (uses .env for Mongo URI)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const { sendReminderEmail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas using environment variable
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

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
  recipients: [String],
  reminderSchedule: [Number], // Array of days before due date
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

app.get('/tasks/reminders/upcoming', async (req, res) => {
  const now = new Date();
  const tasks = await Task.find({ completed: false });

  const dueSoon = tasks.filter(task => {
    const targetDate = new Date(task.dueDate);
    const diffInDays = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
    return task.reminderSchedule?.includes(diffInDays);
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

// Send reminders manually
app.post('/api/reminders/send', async (req, res) => {
  try {
    const upcomingTasks = await Task.find({
      dueDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      completed: false,
    });

    const now = new Date();
    let sentCount = 0;

    for (const task of upcomingTasks) {
      const dueDate = new Date(task.dueDate);
      const diffInDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (task.reminderSchedule?.includes(diffInDays)) {
        const subject = `Reminder: ${task.title} is due soon`;
        const html = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>📌 Task Reminder: ${task.title}</h2>
            <p>${task.description}</p>
            <p><strong>Due Date:</strong> <span style="color: #d9534f;">${dueDate.toLocaleDateString()}</span></p>
            <p>👉 <a href="http://localhost:5173/task/${task._id}" style="color: #0d6efd;">Click here to view this task</a></p>
            <hr>
            <p>This is an automated reminder from the <strong>Compliance Tracker System</strong>.</p>
            <p>Please ensure this task is completed on time.</p>
            <br>
            <p style="font-size: 0.9em; color: #777;">If you have already completed this task, you may ignore this email.</p>
          </div>
        `;

        for (const recipient of task.recipients) {
          try {
            console.log(`📧 Sending to: ${recipient}`);
            const result = await sendReminderEmail(recipient, subject, html);
            const statusCode = result?.[0]?.statusCode || 'OK';
            console.log(`✅ Sent to ${recipient} | Status: ${statusCode}`);
            sentCount++;
          } catch (err) {
            console.error(`❌ Failed to send to ${recipient}:`, err.message);
          }
        }
      }
    }

    res.json({ sent: sentCount });
  } catch (error) {
    console.error('❌ Reminder email error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
