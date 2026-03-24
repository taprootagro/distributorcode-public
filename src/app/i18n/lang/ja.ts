import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryJa } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryJa,
};

export default translations;
