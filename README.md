Setup Instructions

Firebase Project:
Go to Firebase Console, create a project.
Enable Authentication (Email/Password provider).
Enable Firestore Database (Start in Test Mode, then apply the firestore.rules provided above).
Go to Project Settings > General > "Your apps" > Web app (</>), and copy the firebaseConfig object. Paste it into app.js.
Create Initial Admin:
In Firebase Console > Authentication, manually add a user (e.g., admin@su.edu.ph).
In Firestore, create a document in the users collection:
Document ID: The UID of the user you just created.
Fields: email (string), role (string: "admin").
Google Sheets Integration:
Follow the instructions in Code.gs to deploy the Apps Script Webhook.
Paste the resulting URL into the GOOGLE_SCRIPT_URL variable in app.js.

🌐 GitHub Pages Deployment
Create a new GitHub repository (e.g., su-psych-attendance).
Upload index.html and app.js to the root of the repository.
Go to repository Settings > Pages.
Under "Source", select Deploy from a branch, choose main (or master) and / (root), then click Save.
Your app will be live at https://<your-username>.github.io/su-psych-attendance/.

🛡️ Security & Anti-Abuse Features Implemented
Duplicate Prevention: Firestore where query checks for existing studentId + eventId before writing.
Scan Cooldown: 2000ms (2-second) JavaScript cooldown prevents rapid-fire accidental scans.
Immutable Audit Trail: Firestore rules explicitly deny update and delete on the attendance collection.
Role-Based Access: Officers can only scan and view; only Admins can modify events, students, and user roles.

📱 Usage Tips
Printing QRs: Use the "Print QRs" button in the Student tab. It generates a clean, grid-based layout optimized for A4 paper printing via the browser's native print dialog (Ctrl+P / Cmd+P).
Offline Warning: A red banner automatically appears at the top if the device loses internet connectivity.
