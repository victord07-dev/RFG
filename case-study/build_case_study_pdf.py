from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "RFG_Financial_Loan_Operations_Case_Study_FIXED.pdf"

W, H = A4
M = 42

INK = colors.HexColor("#071d2f")
MUTED = colors.HexColor("#5c6d71")
LINE = colors.HexColor("#d7e1df")
PAPER = colors.HexColor("#f2f7f5")
NAVY = colors.HexColor("#002a33")
GREEN = colors.HexColor("#00865a")
GREEN_SOFT = colors.HexColor("#e5f6ef")
BLUE_SOFT = colors.HexColor("#eaf2ff")
AMBER_SOFT = colors.HexColor("#fff5df")
RED_SOFT = colors.HexColor("#fff0f0")


def asset(name):
    return str(ROOT / name)


def public(name):
    return str(ROOT / "public" / name)


def set_font(c, name="Helvetica", size=10, color=INK):
    c.setFont(name, size)
    c.setFillColor(color)


def wrap(text, font, size, max_width):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if stringWidth(test, font, size) <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def paragraph(c, text, x, y, max_width, size=10.5, leading=14, color=MUTED, font="Helvetica"):
    set_font(c, font, size, color)
    for line in wrap(text, font, size, max_width):
        c.drawString(x, y, line)
        y -= leading
    return y


def heading(c, eyebrow, title, subtitle=None, page=None):
    set_font(c, "Helvetica-Bold", 8.5, GREEN)
    c.drawString(M, H - 58, eyebrow.upper())
    set_font(c, "Helvetica-Bold", 27, INK)
    c.drawString(M, H - 88, title)
    if subtitle:
        paragraph(c, subtitle, M, H - 108, W - (M * 2) - 40, 11, 15)
    c.setStrokeColor(LINE)
    c.line(M, H - 132, W - M, H - 132)
    if page:
        set_font(c, "Helvetica-Bold", 8, colors.HexColor("#8b9a9e"))
        c.drawRightString(W - M, H - 58, page)


def footer(c, label):
    c.setStrokeColor(LINE)
    c.line(M, 30, W - M, 30)
    set_font(c, "Helvetica", 7.5, colors.HexColor("#8b9a9e"))
    c.drawString(M, 18, "RFG Financial Loan Operations Platform")
    c.drawRightString(W - M, 18, label)


def card(c, x, y, w, h, title, body=None, fill=colors.white, stroke=LINE, title_color=INK):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    title_size = 12.5
    title_lines = wrap(title, "Helvetica-Bold", title_size, w - 28)
    set_font(c, "Helvetica-Bold", title_size, title_color)
    title_y = y + h - 24
    for title_line in title_lines[:2]:
        c.drawString(x + 14, title_y, title_line)
        title_y -= 14
    if body:
        paragraph(c, body, x + 14, title_y - 4, w - 28, 9.4, 12, MUTED)


def metric_tile(c, x, y, w, h, label, value, note, fill=colors.white, accent=GREEN):
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x + 12, y + h - 34, 26, 26, 8, fill=1, stroke=0)
    set_font(c, "Helvetica-Bold", 8.2, MUTED)
    c.drawString(x + 48, y + h - 22, label.upper())
    set_font(c, "Helvetica-Bold", 20, INK)
    c.drawString(x + 48, y + h - 50, value)
    paragraph(c, note, x + 48, y + h - 68, w - 60, 8.5, 10.5)


def workflow_pill(c, x, y, label, active=True):
    fill = GREEN_SOFT if active else colors.HexColor("#f4f7f6")
    text = colors.HexColor("#006f4b") if active else MUTED
    c.setFillColor(fill)
    c.setStrokeColor(colors.HexColor("#bfe8d3") if active else LINE)
    c.roundRect(x, y, 112, 24, 12, fill=1, stroke=1)
    set_font(c, "Helvetica-Bold", 8, text)
    c.drawCentredString(x + 56, y + 7, label)


def image_fit(c, path, x, y, w, h, radius_box=True):
    img = Image.open(path)
    iw, ih = img.size
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if radius_box:
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    c.drawImage(path, dx, dy, dw, dh, preserveAspectRatio=True, mask="auto")


def bullet_list(c, items, x, y, max_width, color=MUTED):
    set_font(c, "Helvetica", 9.6, color)
    for item in items:
        c.setFillColor(GREEN)
        c.circle(x + 3, y + 4, 2.2, fill=1, stroke=0)
        y = paragraph(c, item, x + 12, y, max_width - 12, 9.6, 12, color)
        y -= 4
    return y


def cover(c):
    c.setFillColor(colors.HexColor("#f7fbfa"))
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, 0, 220, H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#06414a"))
    c.circle(194, 210, 125, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#087a58"))
    c.circle(220, 172, 104, fill=1, stroke=0)

    image_fit(c, public("rfg-logo.png"), 32, H - 104, 62, 62, radius_box=True)
    set_font(c, "Helvetica-Bold", 17, colors.white)
    c.drawString(108, H - 62, "RFG Financial")
    set_font(c, "Helvetica", 8.5, colors.HexColor("#b9d0d0"))
    c.drawString(108, H - 78, "Loan Operations Platform")

    c.setFillColor(colors.HexColor("#123a43"))
    c.roundRect(32, 90, 156, 118, 12, fill=1, stroke=0)
    set_font(c, "Helvetica-Bold", 8.5, colors.HexColor("#62e3ae"))
    c.drawString(48, 174, "CASE STUDY REPORT")
    set_font(c, "Helvetica-Bold", 18, colors.white)
    c.drawString(48, 148, "Admin and Sales")
    c.drawString(48, 127, "Workflow System")
    paragraph(c, "Prepared from supplied scope, implementation notes, screenshots, and verified workflow details.", 48, 106, 120, 8.6, 11, colors.HexColor("#bfd2d2"))

    image_fit(c, public("rfg-logo.png"), 262, H - 172, 90, 90, radius_box=True)
    set_font(c, "Helvetica-Bold", 8.8, GREEN)
    c.drawString(262, H - 200, "PROFESSIONAL PROJECT REPORT")
    set_font(c, "Helvetica-Bold", 32, INK)
    c.drawString(262, H - 238, "RFG Financial")
    c.drawString(262, H - 276, "Loan Operations")
    c.drawString(262, H - 314, "Platform")
    paragraph(c, "A web-based admin and sales panel designed to support application recording, loan status control, EMI follow-up, payment verification, staff access, reports, and activity logs.", 262, H - 342, 270, 12, 16, colors.HexColor("#344c52"))

    chips = ["Admin Panel", "Sales Panel", "Supabase Backend", "Manual Bank Verification", "Google Drive Log Archive", "Responsive UI"]
    x, y = 262, H - 414
    for chip in chips:
        tw = stringWidth(chip, "Helvetica-Bold", 8) + 18
        if x + tw > W - M:
            x, y = 262, y - 24
        c.setFillColor(GREEN_SOFT)
        c.setStrokeColor(colors.HexColor("#bfe8d3"))
        c.roundRect(x, y, tw, 18, 9, fill=1, stroke=1)
        set_font(c, "Helvetica-Bold", 8, colors.HexColor("#006f4b"))
        c.drawString(x + 9, y + 5, chip)
        x += tw + 7

    image_fit(c, asset("admin-dashboard-transactions-two-line.png"), 252, 52, 306, 210, radius_box=True)
    c.showPage()


def overview(c):
    heading(c, "Project overview", "Purpose and context", "The project is an MVP finance workflow platform for Reliant Future Group LLP, consisting of a customer Android app scope and a web admin/sales panel. This report focuses on the web admin and sales panel work covered in the provided project details.", "01")
    y = H - 180
    card(c, M, y, 240, 112, "Project purpose", "The software is intended to support the client's existing physical business workflow. It does not replace manual discussion, physical paperwork, legal documentation, banking processes, finance compliance, tax compliance, collection practices, or regulatory responsibilities.")
    card(c, M + 260, y, 240, 112, "Scope focus", "The web platform supports loan application recording, customer records, loan status management, EMI status management, payment history, payment reminders, payment settings, activity logs, and restricted sales team access.", GREEN_SOFT)
    y -= 142
    for i, (title, body) in enumerate([
        ("Admin control", "Admins can view records, approve or reject applications, mark loans active or closed, edit special terms, approve or reject payment requests, and view reports and logs."),
        ("Sales workflow", "Sales users can create applications, enter loan values, add customer, guarantor and showroom details, complete checklist steps, and submit cash payment requests."),
        ("No file upload storage", "The MVP avoids storing Aadhaar, PAN, RC, insurance, pollution, seller ID, customer ID proof, or other sensitive document images/files unless separately agreed later.")
    ]):
        card(c, M + i * 174, y, 160, 130, title, body)
        c.setStrokeColor(GREEN)
        c.setLineWidth(3)
        c.line(M + i * 174 + 12, y + 126, M + i * 174 + 72, y + 126)
        c.setLineWidth(1)
    footer(c, "Project Overview")
    c.showPage()


def goals(c):
    heading(c, "Problem statement and goals", "What the system needed to solve", "The client needed a practical starting-stage system for staff-led finance operations, while keeping workflows understandable for users who may not be comfortable with complex software.", "02")
    y = H - 190
    card(c, M, y - 190, 240, 190, "Problem statement", fill=NAVY, stroke=colors.HexColor("#0b4650"), title_color=colors.white)
    bullet_list(c, [
        "Loan application and customer information needed to be captured in one structured system.",
        "Admin review, approval, activation, payment verification, and closure needed clear status control.",
        "Cash and normal bank QR payments required manual admin verification because no bank API is used in the MVP.",
        "Sales team access needed to be restricted from admin-only controls and from other sales users' records.",
        "The design needed to stay simple and readable for branch and field users."
    ], M + 16, y - 48, 202, colors.HexColor("#d7e8e5"))
    card(c, M + 260, y - 190, 240, 190, "Project goals")
    bullet_list(c, [
        "Build a web admin panel and restricted sales panel.",
        "Use Supabase PostgreSQL for records, roles, policies, and protected workflows.",
        "Keep payment verification clear for Razorpay, normal bank QR/manual verification, and cash requests.",
        "Use Firebase later for Android EMI reminders.",
        "Retain current and previous month logs in Supabase and archive older logs privately to Google Drive.",
        "Limit account access to one active admin and two active sales members."
    ], M + 276, y - 48, 202)
    card(c, M, y - 340, 500, 112, "Design direction", "The UI direction uses a light business dashboard style with RFG colors: navy, green, white, soft gray, amber for pending states, and red for rejection or failure states. The interface avoids technical labels and uses practical action language such as Create Application, Approve, Reject, Mark Active, Confirm Payment, and Cash Request.", BLUE_SOFT)
    footer(c, "Problem and Goals")
    c.showPage()


def workflow(c):
    heading(c, "Process and workflow", "How the loan workflow operates", "The workflow is built around a controlled handoff from sales entry to admin review, then activation after actual disbursement, followed by EMI and payment verification activity.", "03")
    steps = [
        ("Sales creates application", "Sales records customer details, guarantor details, showroom information, product details, loan values, physical checklist status, and review information."),
        ("Admin reviews application", "Admin approves or rejects the application. If approved, the process continues through discussion, paperwork, and checking."),
        ("Loan becomes active after disbursement", "Admin marks the approved loan active when the customer actually receives funds or the loan cycle should start. The EMI schedule is generated at that point."),
        ("Sales submits collection request", "Sales selects a pending EMI and submits a cash request. Manual bank QR payments also wait for admin verification."),
        ("Admin confirms or rejects payment", "Confirmed payments create a payment record and mark the EMI paid. Rejected requests return the EMI to pending.")
    ]
    y = H - 178
    for idx, (title, body) in enumerate(steps, start=1):
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(M, y - 72, 500, 62, 10, fill=1, stroke=1)
        c.setFillColor(NAVY if idx % 2 else GREEN)
        c.roundRect(M + 14, y - 56, 30, 30, 9, fill=1, stroke=0)
        set_font(c, "Helvetica-Bold", 13, colors.white)
        c.drawCentredString(M + 29, y - 47, str(idx))
        set_font(c, "Helvetica-Bold", 11.5, INK)
        c.drawString(M + 58, y - 30, title)
        paragraph(c, body, M + 58, y - 46, 408, 9.4, 12)
        y -= 78
    card(c, M, 82, 500, 62, "Client update included", "The application flow now treats the parties as customer, guarantor, showroom, and RFG. Guarantor OTP is planned for configuration later and is not mandatory in the current frontend testing flow.", AMBER_SOFT)
    footer(c, "Process")
    c.showPage()


def sales(c):
    heading(c, "Key features", "Sales panel", "The sales panel is focused on daily application creation, pending customer follow-up, and cash collection request submission.", "04")
    c.setFillColor(colors.white)
    c.setStrokeColor(LINE)
    c.roundRect(M, H - 360, 500, 190, 14, fill=1, stroke=1)
    set_font(c, "Helvetica-Bold", 8.5, GREEN)
    c.drawString(M + 24, H - 205, "CURRENT SALES WORKSPACE")
    set_font(c, "Helvetica-Bold", 25, INK)
    c.drawString(M + 24, H - 238, "Fast application entry")
    paragraph(c, "The sales user flow is designed around plain office steps: record details, confirm checklist items, submit for admin review, and follow active EMI collections.", M + 24, H - 260, 292, 10.5, 14)
    metric_tile(c, M + 332, H - 330, 142, 120, "Primary action", "New Application", "Starts the guided loan application process.", GREEN_SOFT, GREEN)

    x = M + 24
    y = H - 350
    for label in ["Customer", "Guarantor", "Showroom", "Loan values"]:
        workflow_pill(c, x, y, label)
        x += 118

    y = H - 490
    for i, (title, body) in enumerate([
        ("Guided application form", "Step-based entry for customer, guarantor, product, showroom, loan values, checklist, and final review."),
        ("Auto EMI calculation", "Processing fee is included. EMI is calculated from loan amount, charge amount, and processing fee across the selected tenure."),
        ("Restricted sales access", "Sales users have simplified navigation and should only see permitted workflows and allowed records.")
    ]):
        card(c, M + i * 174, y, 160, 116, title, body, [colors.white, GREEN_SOFT, BLUE_SOFT][i])

    c.setFillColor(NAVY)
    c.setStrokeColor(colors.HexColor("#0b4650"))
    c.roundRect(M, 112, 500, 160, 14, fill=1, stroke=1)
    set_font(c, "Helvetica-Bold", 8.5, colors.HexColor("#62e3ae"))
    c.drawString(M + 22, 240, "SALES WORKFLOW")
    set_font(c, "Helvetica-Bold", 18, colors.white)
    c.drawString(M + 22, 214, "From entry to admin review")
    flow = [
        ("1", "Create application"),
        ("2", "Checklist"),
        ("3", "Guarantor OTP UI"),
        ("4", "Admin review"),
        ("5", "Active EMI"),
        ("6", "Cash request")
    ]
    fx = M + 22
    for idx, label in flow:
        c.setFillColor(colors.HexColor("#123a43"))
        c.roundRect(fx, 146, 68, 48, 10, fill=1, stroke=0)
        set_font(c, "Helvetica-Bold", 10, colors.HexColor("#62e3ae"))
        c.drawString(fx + 10, 176, idx)
        paragraph(c, label, fx + 10, 164, 50, 7.5, 9, colors.white, "Helvetica-Bold")
        fx += 76
    footer(c, "Sales Panel")
    c.showPage()


def admin_visuals(c):
    heading(c, "Key features", "Admin operations panel", "The admin panel centralizes review, activation, payment verification, reports, staff users, settings, and audit visibility.", "05")
    image_fit(c, asset("admin-dashboard-transactions-two-line.png"), M, 465, 240, 170)
    image_fit(c, asset("applications-review-redesign.png"), M + 260, 465, 240, 170)
    image_fit(c, asset("admin-customers-redesign.png"), M, 250, 240, 170)
    image_fit(c, asset("admin-bank-redesign.png"), M + 260, 250, 240, 170)
    set_font(c, "Helvetica-Bold", 8.5, MUTED)
    c.drawString(M + 8, 448, "Admin dashboard")
    c.drawString(M + 268, 448, "Applications review")
    c.drawString(M + 8, 233, "Customer records")
    c.drawString(M + 268, 233, "Manual bank and cash verification")
    footer(c, "Admin Panel")
    c.showPage()


def backend(c):
    heading(c, "Backend and system design", "Implementation structure", "The backend setup uses Supabase PostgreSQL with protected workflows, role-based access, and database-level limits for active staff accounts.", "06")
    labels = [
        ("React Web App", "Admin and sales UI"),
        ("Supabase Auth", "Admin and sales login"),
        ("PostgreSQL", "Loans, EMI, payments, logs"),
        ("Protected RPC", "Atomic workflow actions"),
        ("Google Drive", "Private log archives")
    ]
    positions = [
        (M, H - 238, 154, 82),
        (M + 173, H - 238, 154, 82),
        (M + 346, H - 238, 154, 82),
        (M, H - 338, 240, 82),
        (M + 260, H - 338, 240, 82)
    ]
    for (title, sub), (x, y, w, h) in zip(labels, positions):
        card(c, x, y, w, h, title, sub, colors.white)
    card(c, M, 320, 240, 160, "Data areas")
    bullet_list(c, [
        "Profiles and roles.",
        "Customers, guarantor/showroom application details, loan applications and terms.",
        "Document checklist status without file upload storage.",
        "EMI schedule, payments, and payment requests.",
        "Payment settings, activity logs, login logs, and archive records."
    ], M + 16, 446, 208)
    card(c, M + 260, 320, 240, 160, "Access controls", fill=NAVY, stroke=colors.HexColor("#0b4650"), title_color=colors.white)
    bullet_list(c, [
        "Only one active admin account.",
        "Only two active sales member accounts.",
        "Sales users cannot change admin access or payment receiver settings.",
        "Payment receiver settings are admin controlled."
    ], M + 276, 446, 208, colors.HexColor("#d7e8e5"))
    image_fit(c, asset("admin-staff-redesign.png"), M, 82, 240, 190)
    image_fit(c, asset("admin-settings-redesign.png"), M + 260, 82, 240, 190)
    footer(c, "Backend Structure")
    c.showPage()


def visibility(c):
    heading(c, "Payment, reports and logs", "Operational visibility", "The platform separates payment records from admin verification, so the team can see what was paid, what needs checking, and what is pending or rejected.", "07")
    image_fit(c, asset("admin-payments-redesign.png"), M, 465, 240, 170)
    image_fit(c, asset("admin-reports-with-graph.png"), M + 260, 465, 240, 170)
    image_fit(c, asset("admin-activity-redesign.png"), M, 250, 240, 170)
    image_fit(c, asset("admin-sellers-redesign.png"), M + 260, 250, 240, 170)
    set_font(c, "Helvetica-Bold", 8.5, MUTED)
    c.drawString(M + 8, 448, "Payment ledger")
    c.drawString(M + 268, 448, "Total finance reports")
    c.drawString(M + 8, 233, "Activity logs and archive visibility")
    c.drawString(M + 268, 233, "Showroom directory")
    footer(c, "Visibility")
    c.showPage()


def solutions(c):
    heading(c, "Solutions implemented", "What was delivered", "The implementation converted the supplied MVP requirements into an operational web workflow with clear screens, protected backend actions, and a cost-conscious archive plan.", "08")
    items = [
        ("Application control", "Admin review, approve, reject, active, closed, special term edits, and MPIN reset workflows were represented in the admin panel."),
        ("Payment verification", "Cash and manual bank QR payments wait for admin approval. Confirmed payments become paid records; rejected requests return to pending."),
        ("Disbursement-based EMI", "The EMI cycle starts when admin marks the approved loan active after actual disbursement, reducing disputes about starting dates."),
        ("Guarantor flow", "The sales application flow now includes guarantor name, number, address, pincode, and a planned guarantor OTP UI."),
        ("Free storage strategy", "Older logs are archived to the client-owned private Google Drive folder instead of filling Supabase storage."),
        ("Responsive UI", "Admin and sales views were refined for desktop, tablet, and mobile usage with simple language and visible workflows.")
    ]
    x0, y0 = M, H - 210
    for idx, (title, body) in enumerate(items):
        col = idx % 3
        row = idx // 3
        card(c, x0 + col * 174, y0 - row * 145, 160, 120, title, body, [colors.white, GREEN_SOFT, BLUE_SOFT][idx % 3])
    footer(c, "Solutions")
    c.showPage()


def conclusion(c):
    heading(c, "Results and current status", "Verified outcomes", "The following outcomes are based only on the provided project conversation, setup notes, screenshots, and user-confirmed tests.", "09")
    y = H - 190
    card(c, M, y - 215, 240, 215, "Workflow confirmed", fill=GREEN_SOFT)
    bullet_list(c, [
        "Create application.",
        "Approve application.",
        "Mark approved loan active.",
        "Generate EMI schedule.",
        "Submit EMI cash request.",
        "Confirm payment.",
        "Reset MPIN.",
        "Confirm sales users cannot see another salesperson's applications."
    ], M + 16, y - 48, 208)
    card(c, M + 260, y - 215, 240, 215, "Configuration completed or prepared")
    bullet_list(c, [
        "Supabase backend setup scripts and protected workflows prepared.",
        "Admin and sales role limits enforced by database design.",
        "Google Drive archive script configured with monthly trigger.",
        "Firebase, OTP/SMS, Razorpay, and Hostinger production deployment remain configuration or deployment items."
    ], M + 276, y - 48, 208)
    card(c, M, 92, 500, 130, "Conclusion", fill=NAVY, stroke=colors.HexColor("#0b4650"), title_color=colors.white)
    paragraph(c, "The RFG Financial Loan Operations Platform establishes a structured admin and sales workflow for loan application handling, EMI follow-up, payment verification, staff access control, reporting, and activity logging. The current build gives the client a practical operational base while keeping paid third-party services and production deployment clearly separated for final configuration.", M + 16, 176, 466, 10.5, 15, colors.HexColor("#d7e8e5"))
    footer(c, "Conclusion")
    c.showPage()


def main():
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("RFG Financial Loan Operations Platform - Case Study")
    cover(c)
    overview(c)
    goals(c)
    workflow(c)
    sales(c)
    admin_visuals(c)
    backend(c)
    visibility(c)
    solutions(c)
    conclusion(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
