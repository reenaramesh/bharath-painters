import { FileText, Hammer, MapPin, MessageCircle, Phone, WalletCards } from "lucide-react";

export const LEAD_ACTIONS = [
  { key: "need_call", label: "Need to call", icon: Phone },
  { key: "need_quotation", label: "Need quotation", icon: FileText },
  { key: "post_quotation", label: "Follow up after quotation", icon: MessageCircle },
  { key: "visits", label: "Visits / area calculation", icon: MapPin },
  { key: "in_progress", label: "Work in progress", icon: Hammer },
  { key: "payment_pending", label: "Payment pending", icon: WalletCards },
];
