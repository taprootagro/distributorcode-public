import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryTh } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryTh,
};

export default translations;
