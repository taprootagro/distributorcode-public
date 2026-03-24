import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryTr } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryTr,
};

export default translations;
