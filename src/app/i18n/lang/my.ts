import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryMy } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryMy,
};

export default translations;
