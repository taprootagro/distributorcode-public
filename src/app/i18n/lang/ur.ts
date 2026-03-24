import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryUr } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryUr,
};

export default translations;
