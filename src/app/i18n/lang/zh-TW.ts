import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryZhTW } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryZhTW,
};

export default translations;
