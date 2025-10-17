# Testing Guide: Dynamic Model Selection

**Date:** 2025-10-17
**Status:** ✅ All Tests Passing (100% Pass Rate)
**Last Updated:** October 17, 2025

## Overview
This guide covers how to test the new dynamic model selection features, including the provider registry, model service, and fuzzy model dropdown. All automated tests are currently passing with the modernized ChatView API.

## Prerequisites

### API Keys Required
To fully test the implementation, you'll need API keys for:
- ✅ **OpenAI** - Get from https://platform.openai.com/api-keys
- ✅ **Anthropic** - Get from https://console.anthropic.com/
- ✅ **Google Gemini** - Get from https://makersuite.google.com/app/apikey
- ✅ **OpenRouter** - Get from https://openrouter.ai/keys
- ⏸️ **Ollama** - Run locally, no API key needed

### Test Environment
- Obsidian with the plugin installed
- Node.js for running unit tests
- Internet connection for API calls

## Unit Tests

### Test Status: ✅ ALL PASSING

**Test Results (as of October 17, 2025):**
- **15/15 test suites passing (100%)**
- **235/236 tests passing** (1 intentionally skipped)
- **Build: ✅ Successful**

### Running Tests
```bash
npm test
```

### Test Coverage

#### ✅ Provider Registry Tests (`tests/providerRegistry.test.ts`)
- ✅ Provider registration
- ✅ Provider lookup
- ✅ Metadata retrieval
- ✅ Implemented provider filtering
- ✅ Registry clearing
- ✅ Size tracking

#### ✅ Model Service Tests (`tests/ModelService.test.ts`)
- ✅ Cache management
- ✅ Cache key generation
- ✅ Singleton pattern
- ✅ Model fetching with Anthropic SDK mock
- ✅ Cache invalidation timing
- ✅ Error handling and fallbacks

#### ✅ Integration Tests (`tests/integration/stopButton.test.ts`)
- ✅ StreamCoordinator state management
- ✅ Central stream state updates
- ✅ Stop/send button synchronization
- ✅ Stream lifecycle management
- ✅ UI callback integration
- ✅ Fallback to ResponseStreamer

#### ✅ Stream Coordinator Tests (`tests/streamCoordinator.test.ts`)
- ✅ Stream lifecycle management
- ✅ UI state callbacks
- ✅ Error handling
- ✅ Async cleanup
- ✅ Abort handling

#### ✅ AI Dispatcher Tests (`tests/aiDispatcher.test.ts`)
- ✅ Request dispatching
- ✅ Plugin app integration
- ✅ Streaming functionality
- ✅ Error handling

#### ✅ Additional Test Suites
- ✅ Error Handler Tests (`tests/errorHandler.test.ts`)
- ✅ LRU Cache Tests (`tests/lruCache.test.ts`)
- ✅ Object Pool Tests (`tests/objectPool.test.ts`)
- ✅ Path Validation Tests (`tests/pathValidation.test.ts`)
- ✅ Message Context Fix Tests (`tests/message-context-fix.test.ts`)
- ✅ DOM Reading Fix Tests (`tests/dom-reading-fix.test.ts`)
- ✅ Stop Button Fixes Tests (`tests/stop-button-fixes.test.ts`)
- ✅ Message Regenerator Tests (`tests/messageRegenerator.test.ts`)
- ✅ Recently Opened Files Tests (`tests/recentlyOpenedFiles.test.ts`)
- ✅ Prompt Constants Tests (`tests/promptConstants.test.ts`)

### Running Specific Tests
```bash
# Run only provider registry tests
npm test -- providerRegistry

# Run only model service tests
npm test -- ModelService

# Run integration tests
npm test -- integration

# Run with coverage
npm test -- --coverage
```

### Recent Fixes Applied
1. **Module Import Paths**: Fixed relative paths from `../../providers/` to `../providers/`
2. **Anthropic SDK Mock**: Added proper mock to avoid fetch API errors
3. **Plugin App Mock**: Added getPluginApp mock for typeguards module
4. **Async Cleanup**: Fixed StreamCoordinator async timing issues
5. **API Modernization**: Updated integration tests to use current ChatView API:
   - `onStreamCoordinatorStateChange()` instead of removed methods
   - `centralStreamState.isStreaming` for stream detection
   - `stopAllActiveStreams()` for consolidated stop logic
   - `streamAssistantResponse()` with try/fallback pattern

## Manual Testing Checklist

### Phase 1: Provider Registration
- [ ] **Verify all providers are registered on startup**
  - Open DevTools Console (Ctrl+Shift+I)
  - Look for registration messages:
    ```
    [ProviderRegistry] Registered provider: openai (OpenAI)
    [ProviderRegistry] Registered provider: anthropic (Anthropic)
    [ProviderRegistry] Registered provider: gemini (Google Gemini)
    [ProviderRegistry] Registered provider: openrouter (OpenRouter)
    ```

### Phase 2: Settings Migration
- [ ] **Test migration from old settings**
  1. Close Obsidian
  2. Edit `.obsidian/plugins/ai-assistant-for-obsidian/data.json`
  3. Remove `openrouterSettings` if it exists
  4. Reopen Obsidian
  5. Check that `openrouterSettings` is automatically added
  6. Verify no data loss in other settings

### Phase 3: OpenRouter Configuration
- [ ] **Add OpenRouter API Key**
  1. Open Settings → AI Assistant → API Keys & Providers
  2. Expand "OpenRouter Configuration"
  3. Enter API key (starts with `sk-or-v1-`)
  4. Verify validation (should reject keys that don't start with `sk-or-`)
  5. Click "Test Connection"
  6. Should show success message with model count

- [ ] **Browse OpenRouter Models**
  1. After successful test, click "Browse Models"
  2. Fuzzy search modal should open
  3. Verify 100+ models are shown
  4. Test search functionality (type "gpt", "claude", etc.)
  5. Verify model metadata displays:
     - Model name
     - Model ID
     - Provider badge (color-coded)
     - Context length
     - Description

### Phase 4: Model Fetching & Caching
- [ ] **Test cache behavior**
  1. Test connection to OpenAI (fetches models)
  2. Check console for cache message
  3. Reload plugin (Ctrl+R in DevTools)
  4. Test connection again
  5. Should use cached models (faster)
  6. Wait 5 minutes, test again
  7. Should fetch fresh models (cache expired)

- [ ] **Test cache invalidation**
  1. Test connection to a provider
  2. Change API key
  3. Test connection again
  4. Should fetch fresh models (cache invalidated)

### Phase 5: UI Integration
- [ ] **Provider Configuration Sections**
  1. Verify all 5 provider sections exist:
     - OpenAI Configuration
     - Anthropic Configuration
     - Google Gemini Configuration
     - Ollama Configuration
     - OpenRouter Configuration (NEW)
  2. Each should have:
     - API key input field
     - Test Connection button
     - Last test result display
     - Available models count

- [ ] **Browse Models Button**
  1. Should appear after successful connection test
  2. Should show model count if > 10 models
  3. Click button to open fuzzy search
  4. Verify all models are searchable

### Phase 6: Fuzzy Model Dropdown
- [ ] **UI Rendering**
  1. Open fuzzy dropdown via "Browse Models"
  2. Verify custom styles are applied:
     - Model titles are bold
     - Provider badges are color-coded
     - Context lengths are displayed
     - Descriptions are italicized
  3. Test on light and dark themes

- [ ] **Search Functionality**
  1. Type partial model name (e.g., "gpt-4")
  2. Should filter results
  3. Type provider name (e.g., "anthropic")
  4. Should show only that provider's models
  5. Test special characters and spaces

- [ ] **Model Selection**
  1. Select a model from the list
  2. Should show notice with model name
  3. Modal should close

### Phase 7: Error Handling
- [ ] **Invalid API Keys**
  1. Enter invalid OpenAI key
  2. Test connection
  3. Should show clear error message
  4. Should not crash plugin

- [ ] **Network Errors**
  1. Disconnect from internet
  2. Test connection
  3. Should show appropriate error
  4. Reconnect and verify recovery

- [ ] **Empty Model Lists**
  1. Test with unconfigured provider
  2. Should handle gracefully
  3. Should show helpful message

### Phase 8: Provider Switching
- [ ] **Test all providers**
  1. Configure OpenAI, test models
  2. Configure Anthropic, test models
  3. Configure Gemini, test models
  4. Configure OpenRouter, test models
  5. Verify each maintains separate cache
  6. Verify no interference between providers

### Phase 9: Performance
- [ ] **Large Model Lists (OpenRouter)**
  1. Test connection to OpenRouter
  2. Measure time to load models
  3. Open fuzzy dropdown
  4. Measure time to render
  5. Test search performance with 100+ models
  6. Should be responsive (< 1 second)

- [ ] **Cache Performance**
  1. First fetch should take 1-3 seconds
  2. Cached fetch should take < 100ms
  3. Check console for timing logs

### Phase 10: Backward Compatibility
- [ ] **Existing Providers Still Work**
  1. Verify OpenAI connection
  2. Verify Anthropic connection
  3. Verify Gemini connection
  4. Verify all existing features work
  5. Verify no breaking changes

## Integration Testing

### Test Scenarios

#### Scenario 1: New User Setup
1. Fresh Obsidian install
2. Install AI Assistant plugin
3. Open settings
4. Add API keys for all providers
5. Test each provider
6. Browse models for each
7. Verify everything works

#### Scenario 2: Existing User Migration
1. User with existing OpenAI + Anthropic setup
2. Update plugin to new version
3. Verify existing settings preserved
4. Verify OpenRouter settings added
5. Verify no data loss
6. Test all existing functionality

#### Scenario 3: Heavy Usage
1. Configure all 5 providers
2. Test connections multiple times
3. Browse models repeatedly
4. Change API keys
5. Clear cache manually
6. Verify stability and no memory leaks

## Debugging Tips

### Enable Debug Mode
1. Open Settings → AI Assistant → Advanced
2. Enable "Debug Mode"
3. Check console for detailed logs

### Console Commands
```javascript
// Get registry info
app.plugins.plugins['ai-assistant-for-obsidian'].providerRegistry

// Get model service cache info
app.plugins.plugins['ai-assistant-for-obsidian'].modelService.getCacheInfo()

// Clear cache
app.plugins.plugins['ai-assistant-for-obsidian'].modelService.clearCache()
```

### Common Issues

#### Models not loading
- Check API key validity
- Check internet connection
- Check console for errors
- Try clearing cache

#### Fuzzy dropdown not opening
- Check if models were fetched successfully
- Verify styles are loaded
- Check console for errors

#### Cache not working
- Verify cache TTL (5 minutes)
- Check if API key changed (invalidates cache)
- Verify singleton pattern working

## Test Results Template

```markdown
## Test Results - October 17, 2025

### Environment
- Obsidian Version: [Your version]
- Plugin Version: 1.0.0
- OS: Windows/macOS/Linux
- Node Version: [Your version]

### Automated Tests ✅
- **Test Suites**: 15/15 passing (100%)
- **Individual Tests**: 235/236 passing (1 skipped)
- **Build Status**: ✅ Successful

#### Test Suite Breakdown
- ✅ Provider Registry: All tests passing
- ✅ Model Service: All tests passing
- ✅ Integration Tests: All tests passing (API modernized)
- ✅ Stream Coordinator: All tests passing
- ✅ AI Dispatcher: All tests passing
- ✅ Error Handler: All tests passing
- ✅ LRU Cache: All tests passing
- ✅ Object Pool: All tests passing
- ✅ Path Validation: All tests passing
- ✅ Message Context: All tests passing
- ✅ DOM Reading: All tests passing
- ✅ Stop Button: All tests passing
- ✅ Message Regenerator: All tests passing
- ✅ Recently Opened Files: All tests passing
- ✅ Prompt Constants: All tests passing

### Manual Tests
- OpenAI Integration: ✅/❌/⏳
- Anthropic Integration: ✅/❌/⏳
- Gemini Integration: ✅/❌/⏳
- OpenRouter Integration: ✅/❌/⏳
- Fuzzy Dropdown: ✅/❌/⏳
- Caching: ✅/❌/⏳
- Migration: ✅/❌/⏳

### Issues Found
1. [Issue description]
2. [Issue description]

### Performance
- OpenRouter model fetch: [time]ms
- Fuzzy search (100+ models): [time]ms
- Cache hit latency: [time]ms
- Test Suite Execution: ~3.8 seconds

### Notes
- All automated tests updated to current ChatView API
- StreamCoordinator integration verified
- Central stream state pattern validated
- Async cleanup issues resolved
```

## Next Steps

After completing testing:
1. Document any issues found
2. Create GitHub issues for bugs
3. Update user documentation
4. Create demo video/screenshots
5. Prepare release notes

## Success Criteria

### Automated Testing ✅
- ✅ All 15 unit test suites passing
- ✅ 235/236 individual tests passing (100% success rate)
- ✅ No regressions in existing features
- ✅ StreamCoordinator integration verified
- ✅ Central stream state pattern validated
- ✅ API modernization completed

### Manual Testing (To Complete)
- ⏳ OpenRouter integration working
- ⏳ Fuzzy dropdown functional
- ⏳ Caching provides performance benefit
- ⏳ Settings migration successful
- ⏳ No memory leaks
- ⏳ Clean console (no errors in production)

### Code Quality ✅
- ✅ TypeScript compilation successful
- ✅ No test timeout issues
- ✅ Async cleanup properly handled
- ✅ Mock systems comprehensive
- ✅ Integration tests aligned with current API

## Recent Updates (October 17, 2025)

### Test Infrastructure Improvements
1. **Fixed Module Imports**: Corrected relative paths in test files
2. **Added Anthropic SDK Mock**: Proper mocking to avoid Node.js fetch API issues
3. **Enhanced Obsidian Mocks**: Added Component and normalizePath
4. **Fixed Async Issues**: Proper cleanup in StreamCoordinator tests
5. **API Modernization**: Updated all integration tests to current ChatView API

### API Changes Reflected in Tests
- **New**: `onStreamCoordinatorStateChange(isStreaming)` - UI state callback
- **New**: `centralStreamState` - Single source of truth for stream state
- **New**: `syncUIWithCentralState()` - UI synchronization
- **Updated**: `hasActiveStream()` - Now checks centralStreamState
- **Updated**: `stopActiveStream()` - Uses stopAllActiveStreams with multi-source stop
- **Updated**: `streamAssistantResponse()` - Try/fallback pattern (Coordinator → ResponseStreamer)

### Build Status
- ✅ `npm run build` - Successful
- ✅ `npm test` - All tests passing (15/15 suites, 235/236 tests)
- ✅ No compilation errors
- ✅ No runtime errors in test environment
