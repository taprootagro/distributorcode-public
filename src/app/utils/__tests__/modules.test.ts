// ============================================================================
// Module Import Tests - 确保所有模块可以正常导入
// ============================================================================

// Test: deepMerge module
import { deepMerge, MERGE_DEEP } from '../deepMerge';

// Test: apiVersion module
import { apiCallWithVersion, registerTransformer } from '../apiVersion';
import type { ApiVersion } from '../apiVersion';

// Test: apiClient module
import { apiClient, apiGet, apiPost } from '../apiClient';

// Test: unified exports
import * as utils from '../index';

console.log('[ModuleTest] All modules imported successfully');

// Type tests (compile-time only)
const testVersion: ApiVersion = 'v1';
const testMerge = deepMerge({ a: 1 }, { b: 2 }, MERGE_DEEP);

export { testVersion, testMerge };
