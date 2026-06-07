import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBTEYT5qUaVjMP3ZamaX7pRov51Dix_74w",
  authDomain: "psychsoc-attendance-system.firebaseapp.com",
  projectId: "psychsoc-attendance-system",
  storageBucket: "psychsoc-attendance-system.firebasestorage.app",
  messagingSenderId: "93131590758",
  appId: "1:93131590758:web:bfea89644381b1972af1a7",
  measurementId: "G-C5SH1EEQP2"
};
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwPWkqDzUA6X7Zqf6OSnPJUZ8koPqbIs5vbiArKJZfxHoWxQqLg8ey6Bh_-moNdhPc/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- STATE ---
let currentUser = null;
let currentRole = null;
let html5QrcodeScanner = null;
let lastScanTime = 0;
let unsubscribeLiveAttendance = null;
let yearChartInstance = null;
let statusChartInstance = null;

// --- INITIALIZATION ---
window.addEventListener('online', () => document.getElementById('offline-banner').classList.add('hidden'));
window.addEventListener('offline', () => document.getElementById('offline-banner').classList.remove('hidden'));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            currentRole = userDoc.data().role;
            document.getElementById('user-info').classList.remove('hidden');
            document.getElementById('user-email').innerText = user.email;
            document.getElementById('user-role-badge').innerText = currentRole;
            document.getElementById('login-view').classList.add('hidden');
            
            if (currentRole === 'admin') {
                document.getElementById('admin-dashboard').classList.remove('hidden');
                renderEvents();
                renderStudents();
                renderUsers();
            } else if (currentRole === 'officer') {
                document.getElementById('officer-dashboard').classList.remove('hidden');
            }
        } else {
            showToast("Role not assigned. Contact Admin.", "error");
            signOut(auth);
        }
    } else {
        currentUser = null;
        currentRole = null;
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
        document.getElementById('officer-dashboard').classList.add('hidden');
        document.getElementById('user-info').classList.add('hidden');
        stopScanner();
    }
});

// --- AUTH ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    document.getElementById('login-spinner').classList.remove('hidden');
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showToast("Login failed: " + error.message, "error");
    } finally {
        document.getElementById('login-spinner').classList.add('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    stopScanner();
    signOut(auth);
});

// --- NAVIGATION ---
window.switchTab = (tab) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-suNavy', 'text-white');
        btn.classList.add('bg-white', 'text-gray-700');
    });
    event.target.classList.remove('bg-white', 'text-gray-700');
    event.target.classList.add('bg-suNavy', 'text-white');
    
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'export') updateExportUI();
};

window.switchOfficerTab = (tab) => {
    document.querySelectorAll('.officer-tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`officer-tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.officer-tab-btn').forEach(btn => {
        btn.classList.remove('bg-suNavy', 'text-white');
        btn.classList.add('bg-white', 'text-gray-700');
    });
    event.target.classList.remove('bg-white', 'text-gray-700');
    event.target.classList.add('bg-suNavy', 'text-white');

    if (tab === 'live') startLiveAttendanceListener();
    else stopLiveAttendanceListener();
};

// --- EVENTS MANAGEMENT ---
document.getElementById('create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('event-name').value;
    try {
        await setDoc(doc(collection(db, "events")), {
            name, active: false, createdBy: currentUser.uid, createdAt: serverTimestamp()
        });
        showToast("Event created!", "success");
        document.getElementById('event-name').value = "";
        renderEvents();
    } catch (err) { showToast("Error creating event", "error"); }
});

window.renderEvents = async () => {
    const snap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
    const container = document.getElementById('events-list');
    container.innerHTML = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        const isActive = data.active;
        const div = document.createElement('div');
        div.className = "bg-white rounded-xl shadow p-4 border-l-4 " + (isActive ? "border-green-500" : "border-gray-300");
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-lg text-suNavy">${data.name}</h4>
                <span class="px-2 py-1 text-xs rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
                    ${isActive ? '🟢 Active' : '⚪ Inactive'}
                </span>
            </div>
            <p class="text-sm text-gray-500 mb-4">Created: ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
            <div class="flex gap-2">
                ${!isActive ? `<button onclick="activateEvent('${docSnap.id}')" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm">Activate</button>` : ''}
                ${isActive ? `<button onclick="endEvent('${docSnap.id}')" class="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700 text-sm">End Event</button>` : ''}
            </div>
        `;
        container.appendChild(div);
    });
};

window.activateEvent = async (eventId) => {
    try {
        const batch = writeBatch(db);
        const activeSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
        activeSnap.forEach(d => batch.update(d.ref, { active: false }));
        batch.update(doc(db, "events", eventId), { active: true });
        await batch.commit();
        showToast("Event activated!", "success");
        renderEvents();
    } catch (err) { showToast("Failed to activate", "error"); }
};

window.endEvent = async (eventId) => {
    try {
        await updateDoc(doc(db, "events", eventId), { active: false });
        showToast("Event ended.", "success");
        renderEvents();
    } catch (err) { showToast("Failed to end event", "error"); }
};

// --- STUDENT MANAGEMENT ---
window.renderStudents = async () => {
    const search = document.getElementById('student-search').value.toLowerCase();
    const snap = await getDocs(collection(db, "students"));
    const tbody = document.getElementById('students-table-body');
    tbody.innerHTML = "";
    
    snap.forEach(docSnap => {
        const data = docSnap.data();
        if (search && !data.name.toLowerCase().includes(search) && !docSnap.id.toLowerCase().includes(search)) return;
        
        const tr = document.createElement('tr');
        tr.className = "border-b hover:bg-gray-50";
        tr.innerHTML = `
            <td class="p-3 font-mono text-sm">${docSnap.id}</td>
            <td class="p-3">${data.name}</td>
            <td class="p-3">${data.year}</td>
            <td class="p-3"><span class="px-2 py-1 text-xs rounded-full ${data.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${data.active ? 'Active' : 'Inactive'}</span></td>
            <td class="p-3 flex gap-2">
                <button onclick="showQR('${docSnap.id}', '${data.name}')" class="text-suNavy hover:text-blue-800"><i class="fas fa-qrcode"></i></button>
                <button onclick="editStudent('${docSnap.id}')" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                <button onclick="toggleStudentActive('${docSnap.id}', ${!data.active})" class="text-${data.active ? 'red' : 'green'}-600 hover:text-${data.active ? 'red' : 'green'}-800">
                    <i class="fas fa-${data.active ? 'ban' : 'check'}"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

document.getElementById('student-search').addEventListener('input', renderStudents);

window.openStudentModal = () => {
    document.getElementById('student-form').reset();
    document.getElementById('edit-student-id').value = "";
    document.getElementById('modal-title').innerText = "Add Student";
    document.getElementById('student-modal').classList.remove('hidden');
    document.getElementById('student-modal').classList.add('flex');
};

window.closeStudentModal = () => {
    document.getElementById('student-modal').classList.add('hidden');
    document.getElementById('student-modal').classList.remove('flex');
};

window.editStudent = async (id) => {
    const snap = await getDoc(doc(db, "students", id));
    const data = snap.data();
    document.getElementById('edit-student-id').value = id;
    document.getElementById('form-student-id').value = id;
    document.getElementById('form-student-id').disabled = true;
    document.getElementById('form-student-name').value = data.name;
    document.getElementById('form-student-year').value = data.year;
    document.getElementById('form-student-active').checked = data.active;
    document.getElementById('modal-title').innerText = "Edit Student";
    document.getElementById('student-modal').classList.remove('hidden');
    document.getElementById('student-modal').classList.add('flex');
};

document.getElementById('student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-student-id').value || document.getElementById('form-student-id').value;
    const name = document.getElementById('form-student-name').value;
    const year = parseInt(document.getElementById('form-student-year').value);
    const active = document.getElementById('form-student-active').checked;

    try {
        await setDoc(doc(db, "students", id), { name, year, active, qrCode: id });
        showToast("Student saved!", "success");
        closeStudentModal();
        renderStudents();
    } catch (err) { showToast("Error saving student", "error"); }
});

window.toggleStudentActive = async (id, status) => {
    await updateDoc(doc(db, "students", id), { active: status });
    renderStudents();
};

window.showQR = (id, name) => {
    document.getElementById('qr-student-name').innerText = name;
    document.getElementById('qr-student-id').innerText = id;
    document.getElementById('qr-code-display').innerHTML = "";
    new QRCode(document.getElementById("qr-code-display"), { text: id, width: 150, height: 150 });
    document.getElementById('qr-modal').classList.remove('hidden');
    document.getElementById('qr-modal').classList.add('flex');
};

window.showPrintableQRs = async () => {
    const container = document.getElementById("print-qr-container");
    container.innerHTML = "";
    const snap = await getDocs(query(collection(db, "students"), where("active", "==", true)));
    snap.forEach(docSnap => {
        const data = docSnap.data();
        const div = document.createElement("div");
        div.className = "border p-4 rounded-lg text-center break-inside-avoid mb-4 bg-white";
        div.innerHTML = `
            <h3 class="font-bold text-lg">${data.name}</h3>
            <p class="text-sm text-gray-600">ID: ${docSnap.id} | Year: ${data.year}</p>
            <div id="qr-print-${docSnap.id}" class="flex justify-center my-2"></div>
            <p class="text-xs text-gray-500 mt-2">SU Psychology Society</p>
        `;
        container.appendChild(div);
        new QRCode(document.getElementById(`qr-print-${docSnap.id}`), { text: docSnap.id, width: 128, height: 128 });
    });
    setTimeout(() => window.print(), 500);
};

// --- USER MANAGEMENT ---
window.renderUsers = async () => {
    const snap = await getDocs(collection(db, "users"));
    const container = document.getElementById('users-list');
    container.innerHTML = "";
    snap.forEach(docSnap => {
        const data = docSnap.data();
        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-gray-50 p-3 rounded-lg";
        div.innerHTML = `
            <div>
                <p class="font-semibold">${docSnap.id}</p>
                <p class="text-sm text-gray-500">${data.email} • <span class="uppercase font-bold text-xs">${data.role}</span></p>
            </div>
        `;
        container.appendChild(div);
    });
};

document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('new-user-email').value;
    const role = document.getElementById('new-user-role').value;
    // Note: Actual Auth user creation must be done in Firebase Console for security in client-only apps
    try {
        await setDoc(doc(db, "users", email), { email, role });
        showToast("Role assigned! (Ensure Auth account exists in Console)", "success");
        document.getElementById('add-user-form').reset();
        renderUsers();
    } catch (err) { showToast("Error assigning role", "error"); }
});

// --- QR SCANNER & ATTENDANCE ---
window.toggleScanner = async () => {
    const btn = document.getElementById('toggle-scanner-btn');
    if (html5QrcodeScanner) {
        stopScanner();
        btn.innerText = "Start Camera";
        btn.classList.remove('bg-red-600');
        btn.classList.add('bg-suNavy');
    } else {
        btn.innerText = "Stop Camera";
        btn.classList.remove('bg-suNavy');
        btn.classList.add('bg-red-600');
        html5QrcodeScanner = new Html5Qrcode("reader");
        try {
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess,
                () => {} // Ignore scan failures (continuous scanning)
            );
        } catch (err) {
            showToast("Camera permission denied.", "error");
            btn.innerText = "Start Camera";
            btn.classList.remove('bg-red-600');
            btn.classList.add('bg-suNavy');
        }
    }
};

window.stopScanner = () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(() => {});
    }
};

async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (now - lastScanTime < 2000) return; // 2-second cooldown
    lastScanTime = now;
    await html5QrcodeScanner.pause();

    try {
        // 1. Check active event
        const eventSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
        if (eventSnap.empty) {
            showToast("❌ No active event found!", "error");
            html5QrcodeScanner.resume();
            return;
        }
        const activeEvent = eventSnap.docs[0];
        const eventId = activeEvent.id;

        // 2. Check student
        const studentSnap = await getDoc(doc(db, "students", decodedText));
        if (!studentSnap.exists() || !studentSnap.data().active) {
            showToast("❌ Invalid or Inactive Student", "error");
            html5QrcodeScanner.resume();
            return;
        }
        const sData = studentSnap.data();

        // 3. Check duplicate
        const attSnap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId), where("studentId", "==", decodedText)));
        if (!attSnap.empty) {
            showToast("⚠ Already Scanned for this event", "warning");
            html5QrcodeScanner.resume();
            return;
        }

        // 4. Save attendance
        const newAttRef = doc(collection(db, "attendance"));
        const attData = {
            eventId, studentId: decodedText, studentName: sData.name, studentYear: sData.year,
            timestamp: serverTimestamp(), scannedBy: currentUser.uid
        };
        await setDoc(newAttRef, attData);

        // 5. Send to Google Sheets
        sendToGoogleSheets({
            eventId, studentId: decodedText, name: sData.name, year: sData.year,
            timestamp: new Date().toISOString(), scannedBy: currentUser.email
        });

        showToast(`✔ ${sData.name} checked in!`, "success");
    } catch (error) {
        console.error(error);
        showToast("❌ Scan failed.", "error");
    } finally {
        html5QrcodeScanner.resume();
    }
}

function sendToGoogleSheets(data) {
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).catch(err => console.error("Sheets sync failed", err));
}

// --- LIVE ATTENDANCE ---
window.startLiveAttendanceListener = async () => {
    const eventSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
    if (eventSnap.empty) return;
    const eventId = eventSnap.docs[0].id;

    const q = query(collection(db, "attendance"), where("eventId", "==", eventId), orderBy("timestamp", "desc"));
    unsubscribeLiveAttendance = onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById("live-attendance-body");
        tbody.innerHTML = "";
        document.getElementById("live-attendance-count").innerText = snapshot.size;
        
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const time = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleTimeString() : "Just now";
            const tr = document.createElement('tr');
            tr.className = "border-b fade-in";
            tr.innerHTML = `<td class="p-3 text-sm text-gray-500">${time}</td><td class="p-3 font-mono text-sm">${d.studentId}</td><td class="p-3">${d.studentName}</td><td class="p-3">${d.studentYear}</td>`;
            tbody.appendChild(tr);
        });
    });
};

window.stopLiveAttendanceListener = () => {
    if (unsubscribeLiveAttendance) {
        unsubscribeLiveAttendance();
        unsubscribeLiveAttendance = null;
    }
};

// --- ANALYTICS ---
window.loadAnalytics = async () => {
    const studentsSnap = await getDocs(collection(db, "students"));
    const total = studentsSnap.size;
    const years = {1: 0, 2: 0, 3: 0, 4: 0};
    studentsSnap.forEach(d => { if (years[d.data().year] !== undefined) years[d.data().year]++; });

    let present = 0;
    const eventSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
    if (!eventSnap.empty) {
        const attSnap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventSnap.docs[0].id)));
        present = attSnap.size;
    }

    const absent = total - present;
    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    document.getElementById("stat-total").innerText = total;
    document.getElementById("stat-present").innerText = present;
    document.getElementById("stat-absent").innerText = absent;
    document.getElementById("stat-rate").innerText = rate + "%";

    // Charts
    const ctxYear = document.getElementById('yearChart').getContext('2d');
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    if (yearChartInstance) yearChartInstance.destroy();
    if (statusChartInstance) statusChartInstance.destroy();

    yearChartInstance = new Chart(ctxYear, {
        type: 'bar',
        data: { labels: ['1st Year', '2nd Year', '3rd Year', '4th Year'], datasets: [{ label: 'Students', data: [years[1], years[2], years[3], years[4]], backgroundColor: '#0B1F4D' }] },
        options: { responsive: true }
    });

    statusChartInstance = new Chart(ctxStatus, {
        type: 'doughnut',
        data: { labels: ['Present', 'Absent'], datasets: [{ data: [present, absent], backgroundColor: ['#10B981', '#EF4444'] }] },
        options: { responsive: true }
    });
};

// --- EXPORT ---
window.updateExportUI = async () => {
    const eventSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
    document.getElementById("export-current-event-name").innerText = eventSnap.empty ? "No active event" : eventSnap.docs[0].data().name;
};

window.exportData = async (scope, format) => {
    showToast("Preparing export...", "info");
    let data = [];
    
    if (scope === 'current') {
        const eventSnap = await getDocs(query(collection(db, "events"), where("active", "==", true)));
        if (eventSnap.empty) { showToast("No active event", "error"); return; }
        const eventId = eventSnap.docs[0].id;
        const eventName = eventSnap.docs[0].data().name;
        const attSnap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
        attSnap.forEach(d => {
            const val = d.data();
            data.push({ "Event ID": eventId, "Event Name": eventName, "Student ID": val.studentId, "Name": val.studentName, "Year": val.studentYear, "Timestamp": val.timestamp ? new Date(val.timestamp.seconds * 1000).toLocaleString() : "N/A", "Scanned By": val.scannedBy });
        });
    } else {
        const eventsSnap = await getDocs(collection(db, "events"));
        const eventNames = {};
        eventsSnap.forEach(d => { eventNames[d.id] = d.data().name; });
        const attSnap = await getDocs(collection(db, "attendance"));
        attSnap.forEach(d => {
            const val = d.data();
            data.push({ "Event ID": val.eventId, "Event Name": eventNames[val.eventId] || "Unknown", "Student ID": val.studentId, "Name": val.studentName, "Year": val.studentYear, "Timestamp": val.timestamp ? new Date(val.timestamp.seconds * 1000).toLocaleString() : "N/A", "Scanned By": val.scannedBy });
        });
    }

    if (data.length === 0) { showToast("No data to export.", "warning"); return; }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    const filename = `Attendance_${scope}_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    XLSX.writeFile(wb, filename, { bookType: format === 'excel' ? 'xlsx' : 'csv' });
    showToast("Export successful!", "success");
};

// --- UTILS ---
window.showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600', info: 'bg-blue-600' };
    toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg fade-in z-50`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
};
