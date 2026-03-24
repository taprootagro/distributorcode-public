import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryTl } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryTl,
};

export default translations;
