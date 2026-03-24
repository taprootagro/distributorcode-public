import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryBn } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryBn,
};

export default translations;
