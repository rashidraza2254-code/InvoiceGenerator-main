import jsPDF from "jspdf";

export function downloadBillPdf(bill) {
  const is58mm = (bill.print_width || "80mm") === "58mm";
  const pageWidth = is58mm ? 58 : 80;
  const doc = new jsPDF({ unit: "mm", format: [pageWidth, 297] });
  const sym = currencyToSymbol(bill.currency);
  const rightEdge = pageWidth - 4;
  let y = 8;

  const center = (text, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text, pageWidth / 2, y, { align: "center" });
    y += size * 0.45 + 1.5;
  };
  const line = () => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(4, y, rightEdge, y);
    y += 2.5;
  };
  const solidLine = () => {
    doc.setLineDashPattern([], 0);
    doc.line(4, y, rightEdge, y);
    y += 2.5;
  };
  const left = (text, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    // Wrap long text
    const lines = doc.splitTextToSize(text, rightEdge - 4);
    lines.forEach((l) => {
      doc.text(l, 4, y);
      y += size * 0.45 + 1.2;
    });
  };
  const row = (l, r, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(l, 4, y);
    doc.text(r, rightEdge, y, { align: "right" });
    y += size * 0.45 + 1.2;
  };

  // Header
  center(bill.cafe_name, 12, true);
  if (bill.cafe_address) center(bill.cafe_address, 8);
  if (bill.gstin) center(`GSTIN: ${bill.gstin}`, 8);
  if (bill.fssai_license) center(`FSSAI: ${bill.fssai_license}`, 7);
  solidLine();

  // Tax Invoice label if GST registered
  if (bill.gstin) {
    center("TAX INVOICE", 10, true);
    y += 1;
  }

  // Bill metadata
  left(`Bill #: ${bill.bill_number}`, 8);
  left(`Date: ${new Date(bill.created_at).toLocaleString("en-IN")}`, 8);
  if (bill.table_name) left(`Table: ${bill.table_name}`, 8);
  if (bill.customer_name) left(`Customer: ${bill.customer_name}`, 8);
  if (bill.customer_phone) left(`Phone: ${bill.customer_phone}`, 8);
  left(`Cashier: ${bill.created_by}`, 8);
  line();

  // Items header
  row("Item", "Amt", 9, true);
  line();

  bill.items.forEach((it) => {
    const lineTotal = Math.max(0, it.price * it.quantity - (it.discount || 0));
    left(`${it.name}`, 9, true);
    row(`  ${it.quantity} x ${sym}${it.price.toFixed(2)}${it.hsn_code ? "  HSN:" + it.hsn_code : ""}`, `${sym}${lineTotal.toFixed(2)}`, 8);
    if (it.discount > 0) {
      row("  Discount", `- ${sym}${it.discount.toFixed(2)}`, 8);
    }
  });
  line();

  // Totals
  row("Subtotal", `${sym}${bill.subtotal.toFixed(2)}`);
  if (bill.discount_amount > 0) row("Discount", `- ${sym}${bill.discount_amount.toFixed(2)}`);
  if (bill.promo_discount > 0) row(`Promo (${bill.promo_code})`, `- ${sym}${bill.promo_discount.toFixed(2)}`);
  if (bill.loyalty_points_redeemed > 0) row("Loyalty Redeemed", `- ${sym}${bill.loyalty_points_redeemed.toFixed(2)}`);

  // GST breakdown
  if (bill.tax_amount > 0) {
    if (bill.gst_type === "igst") {
      row(`IGST (${bill.tax_percent}%)`, `${sym}${bill.igst_amount.toFixed(2)}`);
    } else {
      row(`CGST (${(bill.tax_percent / 2).toFixed(1)}%)`, `${sym}${bill.cgst_amount.toFixed(2)}`);
      row(`SGST (${(bill.tax_percent / 2).toFixed(1)}%)`, `${sym}${bill.sgst_amount.toFixed(2)}`);
    }
  }

  if (bill.service_amount > 0) row(`Service (${bill.service_percent}%)`, `${sym}${bill.service_amount.toFixed(2)}`);
  if (bill.tip_amount > 0) row("Tip", `${sym}${bill.tip_amount.toFixed(2)}`);

  solidLine();
  row("TOTAL", `${sym}${bill.total.toFixed(2)}`, 11, true);

  // Payments
  const payments = bill.payments && bill.payments.length > 0
    ? bill.payments
    : [{ mode: bill.payment_mode || "Cash", amount: bill.total }];
  if (payments.length === 1) {
    row("Payment", `${payments[0].mode}  ${sym}${Number(payments[0].amount).toFixed(2)}`, 9);
  } else {
    left("Split payments:", 9, true);
    payments.forEach((p) => {
      row(`  ${p.mode}`, `${sym}${Number(p.amount).toFixed(2)}`, 8);
    });
  }

  if (bill.loyalty_points_earned > 0) {
    line();
    left(`Loyalty earned: ${bill.loyalty_points_earned.toFixed(0)} pts`, 8);
  }

  if (bill.voided) {
    solidLine();
    center("** VOID **", 12, true);
    if (bill.voided_reason) left(`Reason: ${bill.voided_reason}`, 8);
    if (bill.voided_by) left(`By: ${bill.voided_by}`, 8);
  }

  line();
  if (bill.notes) { left(`Notes: ${bill.notes}`, 8); y += 1; }

  const footer = bill.receipt_footer || "Thank you! Please come again.";
  center(footer, 9);
  y += 2;
  center("--- End of Bill ---", 7);

  doc.save(`Bill-${bill.bill_number}.pdf`);
}

export function currencyToSymbol(currency) {
  switch ((currency || "INR").toUpperCase()) {
    case "USD": return "$";
    case "EUR": return "€";
    case "GBP": return "£";
    case "INR": return "₹";
    case "JPY": return "¥";
    case "AED": return "د.إ ";
    default: return currency + " ";
  }
}
