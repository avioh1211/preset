"""
Naturstyrelsen Shelter Booking Agent — FULLY AUTOMATIC
Fires at 00:01:00, fills the form AND submits. You just sleep.

SETUP (one time):
    pip install playwright
    playwright install chromium

RUN (Friday evening before bed):
    python book_shelter.py
"""

import asyncio
import re
import os
import sys
from datetime import datetime
from playwright.async_api import async_playwright

# ─────────────────────────────────────────────
#  YOUR PROFILE  — edit these!
# ─────────────────────────────────────────────
DATA = {
    "fornavn":   "Avi",
    "efternavn": "Ohayon",
    "email":     "ohayonson@gmail.com",
    "telefon":   "28575581",
    "antal":     "2",
}

TARGET_URL   = "https://book.naturstyrelsen.dk/sted/strandmoelle-strand-shelter/"
TARGET_DAY   = "8"
TARGET_MONTH = "Marts"
FIRE_TIME    = "00:01:00"
MAX_ATTEMPTS = 5
# ─────────────────────────────────────────────

COOKIE_BTN = "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"

# FIX: The submit is an <a> tag with class "place-submitbtn", not a <button>!
SUBMIT_SELECTORS = [
    "a.place-submitbtn",             # EXACT match from the real HTML
    "a:has-text('Book nu')",         # text fallback
    ".place-submitbtn",              # class only
    "button[type='submit']",         # generic fallbacks below
    "input[type='submit']",
    "button:has-text('Book')",
    "button:has-text('Bestil')",
    ".btn-primary",
]


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


async def wait_until(target_time):
    log(f"Waiting until {target_time} ... go to sleep, I have got this!")
    while True:
        now = datetime.now().strftime("%H:%M:%S")
        if now >= target_time:
            log("Fire time reached! Starting booking...")
            return
        if datetime.now().second % 30 == 0:
            h, m, s = target_time.split(":")
            target_sec = int(h)*3600 + int(m)*60 + int(s)
            now_sec = datetime.now().hour*3600 + datetime.now().minute*60 + datetime.now().second
            remaining = target_sec - now_sec
            if remaining > 0:
                print(f"    {remaining//3600:02d}h {(remaining%3600)//60:02d}m {remaining%60:02d}s remaining ...", end="\r", flush=True)
        await asyncio.sleep(0.25)


async def accept_cookies(page):
    try:
        await page.click(COOKIE_BTN, timeout=3000)
        log("Cookies accepted.")
    except Exception:
        pass


async def navigate_to_month(page, target_month):
    log(f"Navigating to {target_month}...")
    next_btn = page.locator("i.fa-chevron-right").first
    for _ in range(18):
        header = await page.locator(".calendar-header").inner_text()
        if target_month.lower() in header.lower():
            return
        await next_btn.click()
        await asyncio.sleep(0.4)
    raise RuntimeError(f"Could not find {target_month}")


async def click_day(page, day):
    log(f"Clicking day {day}...")
    day_cell = page.locator(".day").filter(
        has_text=re.compile(rf"^\s*{re.escape(day)}\s*$")
    ).first
    await day_cell.wait_for(state="visible", timeout=5000)
    await day_cell.click(force=True)
    await asyncio.sleep(1)


async def fill_fields(context):
    await context.fill("#Firstname",    DATA["fornavn"])
    await context.fill("#Lastname",     DATA["efternavn"])
    await context.fill("#Email",        DATA["email"])
    await context.fill("#EmailConfirm", DATA["email"])
    await context.fill("#Phone",        DATA["telefon"])
    await context.select_option("select[name='B_Count']", value=DATA["antal"])
    try:
        await context.check("input[name='erhvervsmaessig_aktivitet']")
    except Exception:
        try:
            await context.check("input[type='checkbox']")
        except Exception:
            log("WARNING: Could not check terms checkbox!")
    log("Form filled!")


async def click_submit(context, label="page"):
    for selector in SUBMIT_SELECTORS:
        try:
            btn = context.locator(selector).first
            if await btn.is_visible():
                log(f"Submit found via '{selector}' on {label} — clicking!")
                await btn.click()
                return True
        except Exception:
            continue
    return False


async def fill_and_submit(page):
    submitted = False

    # Try inside iframes first
    for frame in page.frames:
        try:
            el = await frame.query_selector("#Firstname")
            if el:
                log("Form is inside an iframe.")
                await fill_fields(frame)
                await asyncio.sleep(0.5)
                submitted = await click_submit(frame, label="iframe")
                if not submitted:
                    submitted = await click_submit(page, label="main page")
                break
        except Exception:
            continue

    # Fall back to main page
    if not submitted:
        await page.wait_for_selector("#Firstname", state="visible", timeout=7000)
        log("Form is on main page.")
        await fill_fields(page)
        await asyncio.sleep(0.5)
        submitted = await click_submit(page, label="main page")

    if submitted:
        log("Submit clicked! Waiting for confirmation...")
        await asyncio.sleep(3)
        await check_confirmation(page)
    else:
        raise RuntimeError("Could not find any submit button!")


async def check_confirmation(page):
    keywords = ["bekraeftelse", "confirmation", "tak", "thank", "booket", "booked", "succes", "bestilt"]
    try:
        content = (await page.content()).lower()
        found = [kw for kw in keywords if kw in content]
        if found:
            log(f"CONFIRMED! Booking went through. Check your email at {DATA['email']}")
            alert_user(success=True)
        else:
            log("WARNING: No confirmation detected on page. Check your email to be sure.")
            alert_user(success=False)
    except Exception:
        log("Could not read confirmation page.")


def alert_user(success=True):
    if sys.platform == "darwin":
        msg = "Avi, your shelter is booked! Check your email." if success else "Avi, booking submitted but could not confirm. Check your email."
        os.system(f'say "{msg}"')
    elif sys.platform.startswith("linux"):
        os.system('spd-say "Booking submitted" 2>/dev/null || true')


async def save_screenshot(page, label="result"):
    try:
        path = f"booking_{label}_{datetime.now().strftime('%H%M%S')}.png"
        await page.screenshot(path=path, full_page=True)
        log(f"Screenshot saved: {path}")
    except Exception:
        pass


async def book_shelter():
    await wait_until(FIRE_TIME)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, slow_mo=60)
        page = await browser.new_page()

        log(f"Loading {TARGET_URL}")
        await page.goto(TARGET_URL)
        await accept_cookies(page)

        booked = False
        last_error = None

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                log(f"Attempt {attempt}/{MAX_ATTEMPTS}")
                await page.reload()
                await asyncio.sleep(1.5)
                await accept_cookies(page)
                await navigate_to_month(page, TARGET_MONTH)
                await click_day(page, TARGET_DAY)
                await fill_and_submit(page)
                await save_screenshot(page, label="success")
                booked = True
                log("DONE! Booking submitted. Sweet dreams, Avi!")
                break
            except Exception as e:
                last_error = e
                log(f"Attempt {attempt} failed: {e}")
                await save_screenshot(page, label=f"error_{attempt}")
                if attempt < MAX_ATTEMPTS:
                    log("Retrying in 2 seconds...")
                    await asyncio.sleep(2)
                else:
                    log(f"All {MAX_ATTEMPTS} attempts failed. Last error: {last_error}")
                    alert_user(success=False)

        await browser.close()
        if booked:
            log(f"Check {DATA['email']} for your confirmation email.")
        else:
            log("Booking FAILED. Check the screenshots saved in this folder.")


if __name__ == "__main__":
    print()
    print("=" * 55)
    print("  Naturstyrelsen Shelter Booking Agent")
    print("  FULLY AUTOMATIC - submits while you sleep!")
    print("=" * 55)
    print(f"  Site    : {TARGET_URL}")
    print(f"  Date    : {TARGET_DAY} {TARGET_MONTH}")
    print(f"  Fires   : {FIRE_TIME}")
    print(f"  Name    : {DATA['fornavn']} {DATA['efternavn']}")
    print(f"  Email   : {DATA['email']}")
    print(f"  People  : {DATA['antal']}")
    print("=" * 55)
    print()
    print("  Go to sleep - I will book it for you!")
    print()
    asyncio.run(book_shelter())