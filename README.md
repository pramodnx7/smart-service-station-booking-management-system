# Smart Service Station Booking & Management System

## 📌 Project Overview
Smart Service Station Booking & Management System is a professional web-based solution designed to modernize and streamline vehicle service station operations. The platform centralizes key business processes, including appointment scheduling, customer and vehicle record management, service workflow tracking, billing, spare parts inventory control, emergency service requests, and business reporting.

The system is developed to improve operational efficiency, reduce manual errors, enhance customer experience, and support better decision-making through a structured digital environment.

---

## 🚀 Key Features

### Customer Features
- Secure user registration and login
- Vehicle profile management
- Online service booking with date and time selection
- Real time queue visibility
- Service history and invoice access
- Emergency breakdown assistance requests
- Booking and service notifications

### Administrative Features
- Dashboard with operational insights
- Booking approval, rescheduling, and management
- Dedicated live queue management for appointments, walk-ins, and approved emergencies
- Automatic queue tokens, priority ordering, wait estimates, mechanic assignment, and service-bay control
- Public Now Serving display plus customer queue-position updates
- Mechanic assignment and service progress tracking
- Automated billing and invoice generation
- Spare parts inventory management
- Revenue, expense, and performance reports

---

## 🛠️ Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript

### Backend / Database
- Node.js
- Express
- Firebase Firestore

### Design & Development Tools
- Figma
- Visual Studio Code
- Git & GitHub

---

## 🎯 Project Objectives
- Digitize and optimize service station operations
- Improve booking and customer management processes
- Automate billing and inventory control
- Reduce delays and administrative errors
- Provide data-driven reports for management decisions

---

## 👥 User Roles

### Customer
- Manage account and vehicles
- Schedule service appointments
- View service updates and history
- Request emergency assistance

### Admin / Manager
- Manage daily operations
- Check in appointments, register walk-ins, approve emergency priority, and operate the live queue
- Control bookings and services
- Monitor stock and billing
- Analyze business performance

---

## 📈 Future Enhancements
- Online payment gateway integration
- Mobile application support
- GPS-enabled emergency assistance
- AI-based maintenance recommendations
- SMS / Email notification system

---

## 📄 License
This project is developed for academic, educational, and demonstration purposes.

## Queue Management

Administrators can open `queue-management.html` from the admin sidebar. The public workshop display is available at `queue-display.html`. Queue data is stored in the `queueEntries` and `serviceBays` Firestore collections; existing customer, vehicle, booking, service-job, technician, notification, and invoice records are reused.

See [Queue Management Guide](docs/QUEUE_MANAGEMENT.md) for workflow, configuration, API, and deployment details.
