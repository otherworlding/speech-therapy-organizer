#!/usr/bin/env python3
"""
financial_vault.py
Offline macOS desktop app for sorting and sanitizing cross-border financial documents.
Zero AI/LLM usage — all numeric operations use strict Python arithmetic only.

Dependencies (install via pip):
    pip install pymupdf pandas openpyxl pytesseract pillow

Tesseract OCR engine (for image receipts, install via Homebrew):
    brew install tesseract
"""

import re
import os
import sys
from pathlib import Path

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

import pandas as pd
import fitz  # PyMuPDF


# ── pytesseract (optional — only needed for image receipts) ───────────────────
try:
    import pytesseract
    from PIL import Image as PILImage

    # Probe macOS tesseract locations in priority order
    _TESS_CANDIDATES = [
        "/opt/homebrew/bin/tesseract",   # Apple Silicon Homebrew
        "/usr/local/bin/tesseract",      # Intel Homebrew
        "/usr/bin/tesseract",            # system fallback
    ]
    for _tp in _TESS_CANDIDATES:
        if os.path.exists(_tp):
            pytesseract.pytesseract.tesseract_cmd = _tp
            break

    TESSERACT_OK = True
except ImportError:
    TESSERACT_OK = False

PDF_EXT   = ".pdf"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp"}


# ══════════════════════════════════════════════════════════════════════════════
# Text Extraction
# ══════════════════════════════════════════════════════════════════════════════

def extract_text_pdf(path: str) -> str:
    """Use PyMuPDF to pull text from every page of a PDF."""
    pages = []
    with fitz.open(path) as doc:
        for page in doc:
            pages.append(page.get_text())
    return "\n".join(pages)


def extract_text_image(path: str) -> str:
    """Use pytesseract to OCR a raster image receipt."""
    if not TESSERACT_OK:
        return (
            "[OCR unavailable — install dependencies with:\n"
            "  pip install pytesseract pillow\n"
            "  brew install tesseract]"
        )
    img = PILImage.open(path)
    return pytesseract.image_to_string(img)


# ══════════════════════════════════════════════════════════════════════════════
# Text Processing  (pure regex / string ops — zero AI)
# ══════════════════════════════════════════════════════════════════════════════

def redact_names(text: str, names: list) -> str:
    """Replace every name in *names* with [REDACTED], case-insensitively."""
    result = text
    for name in names:
        name = name.strip()
        if name:
            result = re.sub(re.escape(name), "[REDACTED]", result, flags=re.IGNORECASE)
    return result


def detect_category(text: str, scorp_kws: list, house_kws: list) -> str:
    """
    Exact substring keyword match — returns 'S-Corp Expense', 'Spanish House',
    or 'Uncategorized'. First match wins; no AI inference.
    """
    lower = text.lower()
    for kw in scorp_kws:
        kw = kw.strip().lower()
        if kw and kw in lower:
            return "S-Corp Expense"
    for kw in house_kws:
        kw = kw.strip().lower()
        if kw and kw in lower:
            return "Spanish House"
    return "Uncategorized"


def find_first_amount(text: str) -> str:
    """
    Regex scan for the first monetary figure in the document.
    Returns a plain decimal string ready for float(), or '' if none found.
    Handles both US format (1,234.56) and EU format (1.234,56).
    """
    patterns = [
        # Currency symbol followed by US/EU amount
        r"[\$€£]\s*(\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2})",
        # US thousands+decimal:  1,234.56
        r"\b(\d{1,3}(?:,\d{3})+\.\d{2})\b",
        # EU thousands+decimal:  1.234,56
        r"\b(\d{1,3}(?:\.\d{3})+,\d{2})\b",
        # Plain decimal US:  1234.56
        r"\b(\d+\.\d{2})\b",
        # Plain decimal EU:  1234,56
        r"\b(\d+,\d{2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            raw = m.group(1).strip()
            # Detect EU format: 1.234,56 — thousands sep is '.', decimal is ','
            if re.match(r"^\d{1,3}(\.\d{3})+,\d{2}$", raw):
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", "")   # strip US thousands commas
            try:
                float(raw)
                return raw
            except ValueError:
                continue
    return ""


def compute_usd(amount: float, currency: str, fx_rate: float):
    """
    Strict arithmetic conversion — no rounding beyond Python's round(n, 2).
    Returns (usd_float, formula_string).
    If EUR: usd = round(amount * fx_rate, 2)
    If USD: usd = round(amount, 2)  (no conversion)
    """
    if currency == "EUR":
        usd     = round(amount * fx_rate, 2)
        formula = f"{amount:.2f} EUR × {fx_rate:.4f} (manual FX rate) = {usd:.2f} USD"
    else:
        usd     = round(amount, 2)
        formula = f"{amount:.2f} USD (no conversion applied)"
    return usd, formula


# ══════════════════════════════════════════════════════════════════════════════
# Configuration Wizard
# ══════════════════════════════════════════════════════════════════════════════

class ConfigWizard(tk.Toplevel):
    """
    Modal wizard shown on launch. Collects FX rate, names to redact,
    and keyword lists. Stores result in self.result (dict) or None if cancelled.
    """

    def __init__(self, parent: tk.Tk):
        super().__init__(parent)
        self.title("Financial Vault — Configuration Wizard")
        self.resizable(False, False)
        self.result = None
        self._build_ui()
        self.grab_set()
        self.protocol("WM_DELETE_WINDOW", self._cancel)
        self._center()

    def _center(self):
        self.update_idletasks()
        w = self.winfo_reqwidth()
        h = self.winfo_reqheight()
        x = (self.winfo_screenwidth()  - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"+{x}+{y}")
        self.lift()
        self.focus_force()

    def _build_ui(self):
        p = {"padx": 14, "pady": 7}

        ttk.Label(self, text="Financial Vault", font=("Helvetica", 20, "bold")).grid(
            row=0, column=0, columnspan=2, pady=(22, 2))
        ttk.Label(
            self,
            text="Offline document sorter & sanitizer  •  macOS  •  100% local",
            foreground="#666",
        ).grid(row=1, column=0, columnspan=2, pady=(0, 18))

        field_defs = [
            ("Manual FX Rate  (EUR → USD):",         "fx_rate",       "1.1000"),
            ("Wife's Legal Name to redact:",          "wife_name",     ""),
            ("Children's Names  (comma-separated):",  "children",      ""),
            ("S-Corp Keywords  (comma-separated):",   "scorp_kws",     "video, camera, teradek"),
            ("Spanish House Keywords  (comma-sep.):", "house_kws",     "mortgage, hipoteca, caixabank"),
        ]

        self._vars: dict[str, tk.StringVar] = {}
        for i, (label, key, default) in enumerate(field_defs, start=2):
            ttk.Label(self, text=label, anchor="e", width=40).grid(
                row=i, column=0, sticky="e", **p)
            var = tk.StringVar(value=default)
            ttk.Entry(self, textvariable=var, width=48).grid(
                row=i, column=1, sticky="w", **p)
            self._vars[key] = var

        ttk.Separator(self, orient="horizontal").grid(
            row=len(field_defs) + 2, column=0, columnspan=2,
            sticky="ew", padx=14, pady=10,
        )

        btn_row = ttk.Frame(self)
        btn_row.grid(row=len(field_defs) + 3, column=0, columnspan=2, pady=(0, 20))
        ttk.Button(btn_row, text="Cancel",               command=self._cancel).pack(side="left", padx=10)
        ttk.Button(btn_row, text="Launch Application  →", command=self._submit).pack(side="left", padx=10)

        # Helper text
        ttk.Label(
            self,
            text="All data remains on this machine. Nothing is sent to any server.",
            foreground="#999",
            font=("Helvetica", 10),
        ).grid(row=len(field_defs) + 4, column=0, columnspan=2, pady=(0, 14))

    def _submit(self):
        try:
            fx = float(self._vars["fx_rate"].get().strip())
            if fx <= 0:
                raise ValueError("FX rate must be positive")
        except (ValueError, TypeError):
            messagebox.showerror(
                "Invalid FX Rate",
                "Please enter a positive decimal number for the exchange rate.\n"
                "Example:  1.1000",
                parent=self,
            )
            return

        wife     = self._vars["wife_name"].get().strip()
        children = [n.strip() for n in self._vars["children"].get().split(",") if n.strip()]
        names    = ([wife] if wife else []) + children

        self.result = {
            "fx_rate":   fx,
            "names":     names,
            "scorp_kws": [k.strip() for k in self._vars["scorp_kws"].get().split(",") if k.strip()],
            "house_kws": [k.strip() for k in self._vars["house_kws"].get().split(",") if k.strip()],
        }
        self.destroy()

    def _cancel(self):
        self.result = None
        self.destroy()


# ══════════════════════════════════════════════════════════════════════════════
# Per-Document Review Dialog
# ══════════════════════════════════════════════════════════════════════════════

class ReviewDialog(tk.Toplevel):
    """
    Shown once per document. Displays a redacted text snippet and lets the user
    verify or correct the detected amount, currency, and category before the
    record is committed to the export list.
    """

    def __init__(
        self,
        parent,
        filename: str,
        snippet: str,
        suggested_amount: str,
        suggested_category: str,
    ):
        super().__init__(parent)
        self.title("Review Document")
        self.resizable(True, True)
        self.minsize(620, 520)
        self.result = None   # dict on confirm, None on skip/close
        self._build_ui(filename, snippet, suggested_amount, suggested_category)
        self.grab_set()
        self.protocol("WM_DELETE_WINDOW", self._skip)
        self._center()

    def _center(self):
        self.update_idletasks()
        w, h = 660, 560
        x = (self.winfo_screenwidth()  - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    def _build_ui(self, filename, snippet, amount, category):
        p = {"padx": 12, "pady": 6}

        header = ttk.Frame(self)
        header.pack(fill="x", padx=14, pady=(14, 0))
        ttk.Label(header, text="Document Review", font=("Helvetica", 14, "bold")).pack(anchor="w")
        ttk.Label(header, text=filename, foreground="#555", font=("Courier", 11)).pack(anchor="w")

        # Redacted snippet viewer
        lf = ttk.LabelFrame(self, text=" Redacted Text Snippet  (names replaced with [REDACTED]) ")
        lf.pack(fill="both", expand=True, padx=12, pady=8)
        st = scrolledtext.ScrolledText(
            lf, wrap="word", height=12, font=("Courier", 11), state="normal"
        )
        st.insert("1.0", snippet if snippet.strip() else "[No extractable text found in this document]")
        st.configure(state="disabled", background="#f7f7f7")
        st.pack(fill="both", expand=True, padx=6, pady=6)

        # Confirmation fields
        cf = ttk.LabelFrame(self, text=" Confirm Details ")
        cf.pack(fill="x", padx=12, pady=4)

        ttk.Label(cf, text="Verified Amount:", anchor="e", width=22).grid(
            row=0, column=0, sticky="e", **p)
        self._amount_var = tk.StringVar(value=amount)
        amt_entry = ttk.Entry(cf, textvariable=self._amount_var, width=20)
        amt_entry.grid(row=0, column=1, sticky="w", **p)
        ttk.Label(cf, text="(edit if the auto-detected value is wrong)",
                  foreground="#888", font=("Helvetica", 10)).grid(
            row=0, column=2, sticky="w", padx=4)

        ttk.Label(cf, text="Input Currency:", anchor="e", width=22).grid(
            row=1, column=0, sticky="e", **p)
        self._currency_var = tk.StringVar(value="USD")
        ttk.Combobox(
            cf, textvariable=self._currency_var,
            values=["USD", "EUR"], state="readonly", width=10,
        ).grid(row=1, column=1, sticky="w", **p)
        ttk.Label(cf, text="EUR will be multiplied by the FX rate you set",
                  foreground="#888", font=("Helvetica", 10)).grid(
            row=1, column=2, sticky="w", padx=4)

        ttk.Label(cf, text="Category:", anchor="e", width=22).grid(
            row=2, column=0, sticky="e", **p)
        self._cat_var = tk.StringVar(value=category)
        ttk.Combobox(
            cf, textvariable=self._cat_var,
            values=["S-Corp Expense", "Spanish House", "Uncategorized", "Personal", "Other"],
            width=22,
        ).grid(row=2, column=1, sticky="w", **p)

        # Action buttons
        bf = ttk.Frame(self)
        bf.pack(pady=12)
        ttk.Button(bf, text="Skip this Document",
                   command=self._skip).pack(side="left", padx=10)
        ttk.Button(bf, text="Confirm & Add to Report  →",
                   command=self._confirm).pack(side="left", padx=10)

    def _confirm(self):
        raw = self._amount_var.get().strip().replace(",", ".")
        try:
            amount = float(raw)
            if amount < 0:
                raise ValueError("negative amount")
        except (ValueError, TypeError):
            messagebox.showerror(
                "Invalid Amount",
                "Enter a positive number, e.g.  1234.56\n"
                "Do not include currency symbols.",
                parent=self,
            )
            return

        self.result = {
            "amount":   amount,
            "currency": self._currency_var.get(),
            "category": self._cat_var.get().strip() or "Uncategorized",
        }
        self.destroy()

    def _skip(self):
        self.result = None
        self.destroy()


# ══════════════════════════════════════════════════════════════════════════════
# Main Application Window
# ══════════════════════════════════════════════════════════════════════════════

class FinancialVaultApp(ttk.Frame):
    """
    Primary workspace. Hosts the document list table and export controls.
    Embedded in the root Tk window after the wizard completes.
    """

    def __init__(self, master: tk.Tk, config: dict):
        super().__init__(master)
        self.pack(fill="both", expand=True)
        self._cfg     = config
        self._records: list[dict] = []
        self._build_ui()

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        # Toolbar
        toolbar = ttk.Frame(self, relief="groove")
        toolbar.pack(fill="x", side="top")

        ttk.Button(toolbar, text="＋  Add Documents…",
                   command=self._add_documents).pack(side="left", padx=8, pady=7)
        ttk.Button(toolbar, text="Export to Excel…",
                   command=self._export_excel).pack(side="left", padx=4, pady=7)
        ttk.Button(toolbar, text="Clear All",
                   command=self._clear_all).pack(side="left", padx=4, pady=7)

        fx_label = (
            f"FX Rate: 1 EUR = {self._cfg['fx_rate']:.4f} USD   "
            f"| Redacting {len(self._cfg['names'])} name(s)"
        )
        ttk.Label(toolbar, text=fx_label, foreground="#444",
                  font=("Helvetica", 11)).pack(side="right", padx=14)

        # Records table
        COLS = ("Filename", "Category", "Raw Amount", "Currency", "USD Value", "Formula")
        self._tree = ttk.Treeview(self, columns=COLS, show="headings", selectmode="browse")

        col_cfg = {
            "Filename":   (210, "w"),
            "Category":   (130, "center"),
            "Raw Amount": (100, "e"),
            "Currency":   (75,  "center"),
            "USD Value":  (100, "e"),
            "Formula":    (320, "w"),
        }
        for col, (width, anchor) in col_cfg.items():
            self._tree.heading(col, text=col)
            self._tree.column(col, width=width, anchor=anchor, minwidth=60)

        vsb = ttk.Scrollbar(self, orient="vertical",   command=self._tree.yview)
        hsb = ttk.Scrollbar(self, orient="horizontal", command=self._tree.xview)
        self._tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        hsb.pack(side="bottom", fill="x")
        vsb.pack(side="right",  fill="y")
        self._tree.pack(fill="both", expand=True, padx=2, pady=2)

        # Status bar
        self._status = tk.StringVar(value="Ready — click '＋ Add Documents…' to begin.")
        ttk.Label(self, textvariable=self._status, relief="sunken",
                  anchor="w", padding=(8, 3)).pack(fill="x", side="bottom")

    # ── Document processing ───────────────────────────────────────────────────

    def _add_documents(self):
        paths = filedialog.askopenfilenames(
            title="Select financial documents",
            filetypes=[
                ("All supported files", "*.pdf *.jpg *.jpeg *.png *.tiff *.tif *.bmp"),
                ("PDF documents",       "*.pdf"),
                ("Image receipts",      "*.jpg *.jpeg *.png *.tiff *.tif *.bmp"),
            ],
        )
        if not paths:
            return

        added   = 0
        skipped = 0
        cfg     = self._cfg

        for path in paths:
            ext      = Path(path).suffix.lower()
            filename = Path(path).name

            self._status.set(f"Extracting text: {filename}…")
            self.update_idletasks()

            # ── Step 1: Extract raw text ──────────────────────────────────
            if ext == PDF_EXT:
                raw_text = extract_text_pdf(path)
            elif ext in IMAGE_EXTS:
                raw_text = extract_text_image(path)
            else:
                skipped += 1
                continue

            # ── Step 2: Redact and auto-detect (user will verify both) ────
            redacted          = redact_names(raw_text, cfg["names"])
            suggested_cat     = detect_category(raw_text, cfg["scorp_kws"], cfg["house_kws"])
            suggested_amount  = find_first_amount(raw_text)

            snippet = redacted[:1500] + ("…" if len(redacted) > 1500 else "")

            # ── Step 3: User review popup ─────────────────────────────────
            dlg = ReviewDialog(
                self.master, filename, snippet, suggested_amount, suggested_cat
            )
            self.wait_window(dlg)

            if dlg.result is None:
                skipped += 1
                continue

            # ── Step 4: Strict arithmetic conversion ──────────────────────
            amount   = dlg.result["amount"]
            currency = dlg.result["currency"]
            category = dlg.result["category"]
            usd, formula = compute_usd(amount, currency, cfg["fx_rate"])

            record = {
                "Filename":   filename,
                "Category":   category,
                "Raw Amount": amount,
                "Currency":   currency,
                "USD Value":  usd,
                "Formula":    formula,
            }
            self._records.append(record)

            self._tree.insert("", "end", values=(
                filename,
                category,
                f"{amount:.2f}",
                currency,
                f"{usd:.2f}",
                formula,
            ))
            added += 1

        self._status.set(
            f"Processed {len(paths)} file(s) — "
            f"{added} added, {skipped} skipped.  "
            f"Total records in session: {len(self._records)}."
        )

    # ── Export ────────────────────────────────────────────────────────────────

    def _export_excel(self):
        if not self._records:
            messagebox.showwarning(
                "Nothing to Export",
                "No confirmed records yet.\n"
                "Add documents and confirm them in the review dialog first.",
            )
            return

        save_path = filedialog.asksaveasfilename(
            title="Save Excel Report",
            defaultextension=".xlsx",
            filetypes=[("Excel workbook", "*.xlsx")],
            initialfile="financial_vault_report.xlsx",
        )
        if not save_path:
            return

        # Build DataFrame with explicit column order
        df = pd.DataFrame(
            self._records,
            columns=["Filename", "Category", "Raw Amount", "Currency", "USD Value", "Formula"],
        )

        with pd.ExcelWriter(save_path, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Financial Records")

            ws = writer.sheets["Financial Records"]

            # Auto-fit column widths
            for col_cells in ws.columns:
                max_len = max(
                    len(str(cell.value)) if cell.value is not None else 0
                    for cell in col_cells
                )
                ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 4, 72)

        n = len(self._records)
        messagebox.showinfo("Export Complete", f"Saved {n} record(s) to:\n{save_path}")
        self._status.set(f"Exported {n} record(s)  →  {save_path}")

    # ── Utility ───────────────────────────────────────────────────────────────

    def _clear_all(self):
        if self._records:
            if not messagebox.askyesno(
                "Clear All Records",
                "Remove all records from this session?\n"
                "Exported Excel files are not affected.",
            ):
                return
        self._records.clear()
        for row in self._tree.get_children():
            self._tree.delete(row)
        self._status.set("Session cleared.")


# ══════════════════════════════════════════════════════════════════════════════
# Entry Point
# ══════════════════════════════════════════════════════════════════════════════

def main():
    root = tk.Tk()
    root.withdraw()   # keep root hidden while the wizard is open
    root.update()     # flush the withdraw before opening the Toplevel

    wizard = ConfigWizard(root)
    wizard.lift()          # bring in front of all other windows
    wizard.focus_force()   # grab keyboard focus on macOS
    root.wait_window(wizard)

    if wizard.result is None:
        # User closed or cancelled the wizard
        root.destroy()
        sys.exit(0)

    # Show and configure main window
    root.deiconify()
    root.title("Financial Vault")
    root.resizable(True, True)

    # Center main window
    root.update_idletasks()
    w, h = 1020, 640
    x = (root.winfo_screenwidth()  - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"{w}x{h}+{x}+{y}")

    FinancialVaultApp(root, wizard.result)
    root.mainloop()


if __name__ == "__main__":
    main()
