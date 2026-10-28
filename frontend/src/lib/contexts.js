import { createContext } from 'react';

export const UserContext = createContext(null);

export const SuperCategoryContext = createContext({
  superCategories: [],
  activeSuperCategory: null,
  setActiveSuperCategory: () => {},
});

export const StockOperatorContext = createContext({
  operator: null,
  setOperator: () => {},
  clearOperator: () => {},
});
