---
name: "source-command-changelog"
description: "Generate \"What's New\" text for app store submissions based on recent changes"
---

# source-command-changelog

Use this skill when the user asks to run the migrated source command `changelog`.

## Command Template

# Changelog / What's New Generator

Generate user-friendly "What's New" text for app store submissions based on git history, provided changes, or interactive input.

## Workflow Overview

1. **Gather context** - Version, target platform, recent changes
2. **Analyse changes** - Git history, PR descriptions, manual input
3. **Generate draft** - User-friendly, benefit-focused copy
4. **Review and refine** - Interactive editing
5. **Output formatted text** - Ready for App Store Connect / Play Console

## Character Limits

| Platform | Field         | Limit                         |
| -------- | ------------- | ----------------------------- |
| iOS      | What's New    | 4000 characters               |
| Android  | Release Notes | 500 characters per language   |
| Both     | Short version | ~150 characters (recommended) |

**Best Practice:** Keep it concise. Users rarely read long changelogs.

## Interactive Setup

```typescript
AskUserQuestion({
  questions: [
    {
      question: "How would you like to generate the changelog?",
      header: "Source",
      options: [
        {
          label: "From git history (Recommended)",
          description: "Analyse commits since last release/tag",
        },
        {
          label: "From PR descriptions",
          description: "Extract from merged pull requests",
        },
        {
          label: "Manual input",
          description: "I'll describe the changes",
        },
      ],
      multiSelect: false,
    },
    {
      question: "What's the tone for this release?",
      header: "Tone",
      options: [
        {
          label: "Professional",
          description: "Clean, straightforward updates",
        },
        {
          label: "Friendly",
          description: "Warm, conversational style",
        },
        {
          label: "Exciting",
          description: "Enthusiastic about new features",
        },
        {
          label: "Minimal",
          description: "Just the essentials, very brief",
        },
      ],
      multiSelect: false,
    },
    {
      question: "Which platform(s)?",
      header: "Platform",
      options: [
        {
          label: "Both iOS and Android",
          description: "Generate for both platforms",
        },
        {
          label: "iOS only",
          description: "App Store Connect format",
        },
        {
          label: "Android only",
          description: "Play Console format (500 char limit)",
        },
      ],
      multiSelect: false,
    },
  ],
});
```

## Git History Analysis

### Find Changes Since Last Release

```bash
# Find the most recent tag
git describe --tags --abbrev=0 2>/dev/null || echo "No tags found"

# List commits since last tag
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline --no-merges

# Or since a specific version
git log v1.0.0..HEAD --oneline --no-merges

# Get commit messages with more detail
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --pretty=format:"%s%n%b" --no-merges
```

### Categorise Commits

Analyse commit messages for common patterns:

```typescript
// Common commit prefixes to categorise
const categories = {
  feat: "New Features",
  fix: "Bug Fixes",
  perf: "Performance",
  ui: "UI/UX Improvements",
  refactor: "Under the Hood",
  docs: "Documentation",
  chore: "Maintenance",
};

// Search for commits by type
Grep({ pattern: "^feat:|^feature:", path: ".git/logs" });
```

**Categorisation output:**

```
📊 COMMIT ANALYSIS
------------------------------------------
Since last release (v1.2.0):

New Features (feat):
- Added dark mode support
- New profile customisation options

Bug Fixes (fix):
- Fixed crash on startup for iOS 15
- Resolved sync issues with large files

Performance (perf):
- Improved app launch time by 40%

UI Improvements:
- Refreshed settings screen design
- Better accessibility support
```

## PR-Based Analysis

If using PRs as source:

```bash
# List merged PRs since last release (requires gh CLI)
gh pr list --state merged --base main --search "merged:>2024-01-01" --json title,body,labels --limit 50
```

Extract from PR titles and bodies:

- Look for "What's New" or "Release Notes" sections
- Use PR labels (feature, bug, enhancement) for categorisation

## User-Friendly Transformation

### Guidelines

1. **Focus on benefits, not technical details**
   - ❌ "Fixed null pointer exception in UserService.java"
   - ✅ "Fixed a crash that could occur when loading your profile"

2. **Use active, simple language**
   - ❌ "The performance of the application has been optimised"
   - ✅ "The app now launches faster"

3. **Group related changes**
   - Don't list 10 small fixes separately
   - Group as "Various bug fixes and improvements"

4. **Highlight what users care about**
   - New features
   - Fixed annoying bugs
   - Performance improvements
   - UI/UX enhancements

5. **Keep it scannable**
   - Use bullet points
   - Lead with the most important changes
   - Limit to 3-5 main points

### Template Structures

**Standard Release:**

```
What's New in {version}:

• {Main new feature or improvement}
• {Second notable change}
• {Bug fix that affected many users}
• Various bug fixes and performance improvements

Thanks for using {App Name}! We love hearing from you.
```

**Bug Fix Release:**

```
{version} - Bug Fixes

We've squashed some bugs:
• {Most impactful fix}
• {Other notable fix}
• General stability improvements

Thanks for your feedback!
```

**Major Feature Release:**

```
Introducing {Feature Name}!

{One sentence about what it does}

Also in this update:
• {Supporting feature}
• {Performance improvement}
• Bug fixes and polish

We can't wait for you to try it!
```

**Minimal Release:**

```
Bug fixes and performance improvements.
```

## Output Formats

### iOS (App Store Connect)

```
============================================
APP STORE CONNECT - WHAT'S NEW
============================================
Version: {version}
Characters: {count}/4000

------------------------------------------
What's New in {version}

• Dark mode is here! Switch in Settings > Appearance
• Fixed an issue where notifications weren't appearing
• Performance improvements for smoother scrolling
• Various bug fixes

Thanks for using {App Name}!
------------------------------------------

📋 Copy the text above to App Store Connect > Version > What's New
```

### Android (Play Console)

```
============================================
PLAY CONSOLE - RELEASE NOTES
============================================
Version: {version}
Characters: {count}/500

------------------------------------------
{version} brings dark mode, notification fixes, and smoother performance. Thanks for your feedback!
------------------------------------------

⚠️  Note: Play Console has a 500 character limit per language.
📋 Copy to Play Console > Release > What's new in this release
```

### Both Platforms

```
============================================
WHAT'S NEW - ALL PLATFORMS
============================================
Version: {version}

📱 iOS (App Store Connect)
------------------------------------------
Characters: {count}/4000

What's New in {version}

• Dark mode is here! Switch in Settings > Appearance
• Fixed an issue where notifications weren't appearing
• Performance improvements for smoother scrolling
• Various bug fixes

Thanks for using {App Name}!

🤖 Android (Play Console)
------------------------------------------
Characters: {count}/500

{version} brings dark mode, notification fixes, and smoother performance. Thanks for your feedback!

============================================
```

## Interactive Refinement

After generating initial draft:

```typescript
AskUserQuestion({
  questions: [
    {
      question: "How does this changelog look?",
      header: "Review",
      options: [
        {
          label: "Looks good, use it",
          description: "Accept the generated text",
        },
        {
          label: "Make it shorter",
          description: "Condense to fewer points",
        },
        {
          label: "Add more detail",
          description: "Expand on the changes",
        },
        {
          label: "Change the tone",
          description: "Adjust to different style",
        },
      ],
      multiSelect: false,
    },
  ],
});
```

## Localisation Considerations

If app supports multiple languages:

```
💡 LOCALISATION REMINDER
------------------------------------------
Your app supports these languages: {languages}

Play Console requires release notes in each language.
App Store Connect will use your default language if not translated.

Options:
1. Provide same text in all languages (acceptable)
2. Translate release notes for each language
3. Use brief, easily translatable text
```

## Version Detection

Automatically detect version from config:

```typescript
// Read version from app.config.js
Read({ file_path: "app.config.js" });

// Or from package.json
Read({ file_path: "package.json" });
```

```bash
# Get version from expo config
npx expo config | grep -E "\"version\":"
```

## Saving Changelogs

Optionally save to file for records:

```
💾 SAVE CHANGELOG?
------------------------------------------
Would you like to save this changelog to CHANGELOG.md?

This helps maintain release history and can be used for:
- Historical reference
- Documentation
- Future release planning
```

**CHANGELOG.md format:**

```markdown
# Changelog

## [1.3.0] - 2024-01-15

### Added

- Dark mode support
- Profile customisation options

### Fixed

- Crash on startup for iOS 15
- Sync issues with large files

### Changed

- Improved app launch time by 40%
- Refreshed settings screen design
```

## Error Handling

### No Git History

```
⚠️  NO GIT HISTORY FOUND
------------------------------------------
Could not find git history or tags.

Options:
1. Describe the changes manually
2. Check if you're in the correct directory
3. Create a git tag for the previous release first:
   git tag v1.0.0 <commit-hash>
```

### No Changes Found

```
⚠️  NO CHANGES DETECTED
------------------------------------------
No commits found since the last release tag.

Either:
1. There are no new changes to report
2. The release tag is missing
3. Changes were made on a different branch

For a minimal release:
"Bug fixes and performance improvements."
```

## Best Practices

### Do

- Lead with the most exciting change
- Use user-friendly language
- Be specific about fixed bugs that affected many users
- Thank users for their feedback
- Keep it brief (users skim)

### Don't

- List internal refactoring
- Use technical jargon
- Mention features that aren't ready
- Include version numbers of dependencies
- Write novels (nobody reads them)

### Examples of Good Changelogs

**Concise and Clear:**

```
• New: Quick actions from the home screen
• Fixed: Occasional freezing when uploading photos
• Faster app startup
```

**User-Focused:**

```
You asked, we listened!

• Export your data to PDF
• Fixed the annoying login loop
• Works better on older devices now

Keep the feedback coming!
```

**Professional:**

```
Version 2.1 improvements:

• Enhanced security for your account
• Resolved sync issues across devices
• Performance optimisations

Thank you for choosing {App Name}.
```

## Quick Reference

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Create a release tag
git tag -a v1.3.0 -m "Release 1.3.0"

# List all tags
git tag -l

# Push tags to remote
git push --tags
```
