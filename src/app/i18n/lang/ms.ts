import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryMs } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryMs,
};

export default translations;
