# Marvel Tracker: Java and MySQL version (college RDBMS project)

This folder is the original version of the project, built for a Relational Database Management Systems course: a 15-table MySQL schema in third normal form, triggers, stored procedures, views, 38 queries, and a Java (JDBC) backend with login and an admin panel. The live website in the repository root is a separate, simpler version that needs no database.

Differences from the original download:
- The Marvel Studios logo and Avengers artwork were removed because they are not mine to publish. Add your own images at `frontend/img/marvel-studios.png` and `frontend/img/avengers-bg.jpg`, or edit the CSS and HTML that mention them.
- Copy `backend/db.properties.example` to `backend/db.properties` and put your own MySQL password in it. Never commit that file.
- You need the MySQL Connector/J jar in `backend/lib/` (see the steps below).

---

# Marvel Tracker (RDBMS Project)

A Letterboxd-style checklist for Marvel **movies** and **series**.
Database: **MySQL** · Backend: **Java (JDBC)** · Frontend: **HTML / CSS / JavaScript**

```
marvel-tracker/
├── database/    <- THE MAIN PART (SQL files, run in order)
│   ├── 00_run_all.sql            runs 01-04 and 07 in one go
│   ├── 01_schema.sql             tables, keys, constraints
│   ├── 02_triggers_procedures.sql  triggers, procedures, function
│   ├── 03_seed.sql               sample values (37 movies, 12 series, 5 users, reviews)
│   ├── 04_views.sql              views
│   ├── 05_queries.sql            queries for your report
│   ├── 06_upgrade_posters.sql    only for databases created before posters existed
│   └── 07_auth.sql               login system: passwords, roles, sessions (safe to run twice)
├── backend/     Java code + db.properties (your MySQL password goes here)
├── frontend/    the website (Movies / Series / My Checklist / Stats)
├── docs/        ER_diagram.png + REPORT_NOTES.md (help for writing the report)
└── .vscode/     settings so VS Code runs the Java part with one click
```

---

## ONE-TIME SETUP (about 20 minutes)

### 1. Install these
| What | Where | Note |
|---|---|---|
| **JDK 17 or newer** | https://adoptium.net | During install, tick "Set JAVA_HOME" / "Add to PATH" |
| **MySQL Community Server 8** | https://dev.mysql.com/downloads/installer/ | Choose a **root password** and remember it |
| **VS Code** | https://code.visualstudio.com | you have this |

### 2. VS Code extensions (Extensions icon on the left, search and install)
- **Extension Pack for Java** (Microsoft)

### 3. Download the MySQL driver for Java (one file)
Download this file: https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/8.4.0/mysql-connector-j-8.4.0.jar
and put it inside the **`backend/lib/`** folder.

### 4. Put your password in the project
Open `backend/db.properties` and change `password=your_mysql_password` to your real MySQL root password.

---

## RUN IT

Open the `marvel-tracker` folder in VS Code (File > Open Folder). Then open the terminal in VS Code (**Terminal > New Terminal**).

### Step A: create the database
```
mysql -u root -p < database/00_run_all.sql
```
Type your MySQL password when asked. No output means success.
(If `mysql` is "not recognized" on Windows, add `C:\Program Files\MySQL\MySQL Server 8.0\bin` to your PATH, or use the MySQL Workbench option below.)

### Step B: start the app
- **Easiest:** open `backend/src/Main.java` in VS Code and press **F5** (or click "Run" above `main`).
- **Or in the terminal (Windows):** `backend\run.bat`
- **Or in the terminal (Mac/Linux):** `bash backend/run.sh`

You should see:
```
Connected to database OK.
Marvel Tracker running ->  http://localhost:8080
```

### Step C: open the website
Go to **http://localhost:8080** in your browser. Done.

---

## Running the SQL without the terminal (MySQL Workbench)
1. Open MySQL Workbench > connect to your local server.
2. File > Open SQL Script > pick `01_schema.sql` > click the lightning icon. Repeat for `02`, `03`, `04` **in that order**.
3. Open `05_queries.sql` and run queries one by one (select a query, press Ctrl+Enter) to take screenshots for your report.

## Troubleshooting
| Problem | Fix |
|---|---|
| `Access denied for user 'root'` | Wrong password in `backend/db.properties` |
| `Communications link failure` | MySQL isn't running (Windows: search "Services" > MySQL80 > Start) |
| `No suitable driver` / `ClassNotFoundException` | You skipped step 3: the `.jar` must be inside `backend/lib/` |
| Page says "Could not reach the backend" | Step B isn't running |
| Port 8080 already in use | Change `port=` in `db.properties` |
| Want to reset all data | Run Step A again |

## Using the app
- You first see only the Marvel Studios home screen. Click **Sign up** or **Log in** to enter. Every user has their own checklist.
- **Movies** and **Series** tabs are separate sections. Filter by phase, search, or by status.
- **Watched / + Want / Rate** on each card. Clicking an active button removes it. Rating a title also marks it watched (a trigger does this).
- Click a title name for details: genres, characters, reviews.
- **Stats** tab shows results of report-style queries.

## Notes
- Box office figures and some details are approximate sample data. Check them before quoting them in the report.
- Don't share `db.properties` with your real password.

## Adding posters
1. Open `frontend/posters/FILENAMES.txt`. It lists the exact file name each title expects, e.g. `iron-man-2008.jpg`.
2. Find a poster image for each title (search "<title> poster" and save the image), rename it to that exact file name, and put it in the `frontend/posters/` folder.
3. Refresh the website (Ctrl+F5). Titles without an image keep the colored card, so you can add posters a few at a time.

The file name for each title is stored in the database (`titles.poster_url`), so the image path comes from SQL like everything else.

## Login, sign up and controlling users

**One-time setup (existing database):** in MySQL Workbench open `database/07_auth.sql` and run it once. (A fresh install using `00_run_all.sql` already includes it.)

**Becoming the admin (owner):**
1. Start the app (F5 on `Main.java`). The VS Code terminal prints an **ADMIN SETUP CODE** (6 digits).
2. Open http://localhost:8080, click **Sign up**, use the username **tanish**, any email and a password (8+ characters), and paste the setup code.
3. You are now an admin and you keep the existing checklist of the demo account. A new code is printed on each start until an admin exists.

**Admin tab** (only admins see it): search users, make/remove admin, suspend/reactivate, set or reset a password (with a Generate button), delete a user. You cannot change or delete yourself, and the database refuses to remove the last active admin.

**Other demo users** (nick_fury, wanda_m, ...) have no password; they cannot log in until you set one in the Admin tab.

**Security in short:** passwords are stored as salted PBKDF2-SHA256 hashes, sessions use a random cookie (only its hash is stored), 5 wrong passwords lock the account for 10 minutes.

**Sharing it online (Cloudflare Tunnel / ngrok):** only do this now that login exists. Friends sign up themselves. The Marvel logo, artwork and posters are copyrighted, so keep it local for submission or remove them for a public version.
