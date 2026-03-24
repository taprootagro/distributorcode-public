import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryHi } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryHi,
};

export default translations;
