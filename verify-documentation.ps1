# Documentation Verification Script
# Verifies that all documentation is complete and properly formatted

Write-Host "`nFoodXchange Backend Documentation Verification" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "`nVerifying documentation completeness...`n" -ForegroundColor Yellow

$errors = 0
$warnings = 0

# Define required documentation files
$requiredDocs = @{
    "README.md" = @{
        Path = "./README.md"
        MinSize = 5000
        RequiredSections = @("Quick Start", "Features", "Architecture", "API Documentation", "Deployment")
    }
    "TROUBLESHOOTING.md" = @{
        Path = "./docs/TROUBLESHOOTING.md"
        MinSize = 10000
        RequiredSections = @("Server Issues", "Docker Issues", "Redis Issues", "MongoDB Issues")
    }
    "API_REFERENCE.md" = @{
        Path = "./docs/API_REFERENCE.md"
        MinSize = 15000
        RequiredSections = @("Authentication", "Products", "Orders", "RFQ", "WebSocket")
    }
    "DEPLOYMENT.md" = @{
        Path = "./docs/DEPLOYMENT.md"
        MinSize = 10000
        RequiredSections = @("Prerequisites", "Docker", "Cloud", "Production")
    }
    "INDEX.md" = @{
        Path = "./docs/INDEX.md"
        MinSize = 5000
        RequiredSections = @("Documentation Overview", "Quick Start", "Troubleshooting")
    }
}

# Check each required document
foreach ($doc in $requiredDocs.GetEnumerator()) {
    $docName = $doc.Key
    $docInfo = $doc.Value
    
    Write-Host "Checking $docName..." -NoNewline
    
    if (Test-Path $docInfo.Path) {
        $content = Get-Content $docInfo.Path -Raw
        $size = (Get-Item $docInfo.Path).Length
        
        # Check file size
        if ($size -lt $docInfo.MinSize) {
            Write-Host " WARNING" -ForegroundColor Yellow
            Write-Host "  - File size ($size bytes) is below recommended minimum ($($docInfo.MinSize) bytes)" -ForegroundColor Yellow
            $warnings++
        }
        else {
            Write-Host " OK" -ForegroundColor Green -NoNewline
        }
        
        # Check required sections
        $missingSections = @()
        foreach ($section in $docInfo.RequiredSections) {
            if ($content -notmatch $section) {
                $missingSections += $section
            }
        }
        
        if ($missingSections.Count -gt 0) {
            if ($warnings -eq 0) { Write-Host "" }
            Write-Host "  - Missing sections: $($missingSections -join ', ')" -ForegroundColor Yellow
            $warnings++
        }
        else {
            Write-Host " ✓" -ForegroundColor Green
        }
    }
    else {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Host "  - File not found!" -ForegroundColor Red
        $errors++
    }
}

# Check for old documentation files that should have been removed
Write-Host "`nChecking for outdated documentation..." -ForegroundColor Yellow
$oldDocs = @(
    "./ARCHITECTURE.md",
    "./OPTIMIZATION_SUMMARY_old.md",
    "./docs/old_*"
)

$foundOldDocs = @()
foreach ($oldDoc in $oldDocs) {
    if (Test-Path $oldDoc) {
        $foundOldDocs += $oldDoc
    }
}

if ($foundOldDocs.Count -gt 0) {
    Write-Host "Found old documentation files that should be removed:" -ForegroundColor Yellow
    foreach ($oldDoc in $foundOldDocs) {
        Write-Host "  - $oldDoc" -ForegroundColor Yellow
    }
    $warnings++
}
else {
    Write-Host "No outdated documentation found ✓" -ForegroundColor Green
}

# Check documentation structure
Write-Host "`nChecking documentation structure..." -ForegroundColor Yellow
$docStructure = @(
    "./docs",
    "./docs/images",
    "./docs/examples"
)

foreach ($dir in $docStructure) {
    if (Test-Path $dir) {
        Write-Host "  $dir ✓" -ForegroundColor Green
    }
    else {
        Write-Host "  $dir (optional)" -ForegroundColor Gray
    }
}

# Check for broken links in documentation
Write-Host "`nChecking for broken internal links..." -ForegroundColor Yellow
$brokenLinks = 0
$docsToCheck = Get-ChildItem -Path . -Include *.md -Recurse | Where-Object { $_.FullName -notmatch "node_modules" }

foreach ($docFile in $docsToCheck) {
    $content = Get-Content $docFile.FullName -Raw
    $links = [regex]::Matches($content, '\]\((\.\./[^)]+|\./[^)]+)\)')
    
    foreach ($link in $links) {
        $linkPath = $link.Groups[1].Value
        $absolutePath = Join-Path (Split-Path $docFile.FullName) $linkPath
        
        if (-not (Test-Path $absolutePath)) {
            if ($brokenLinks -eq 0) {
                Write-Host "Found broken links:" -ForegroundColor Yellow
            }
            Write-Host "  - In $($docFile.Name): $linkPath" -ForegroundColor Yellow
            $brokenLinks++
        }
    }
}

if ($brokenLinks -eq 0) {
    Write-Host "No broken internal links found ✓" -ForegroundColor Green
}
else {
    $warnings += $brokenLinks
}

# Summary
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "`nAll documentation checks passed! ✓" -ForegroundColor Green
    Write-Host "Documentation is complete and properly formatted." -ForegroundColor Green
}
else {
    if ($errors -gt 0) {
        Write-Host "`nErrors found: $errors" -ForegroundColor Red
        Write-Host "Please fix these errors before proceeding." -ForegroundColor Red
    }
    if ($warnings -gt 0) {
        Write-Host "`nWarnings found: $warnings" -ForegroundColor Yellow
        Write-Host "Consider addressing these warnings for better documentation quality." -ForegroundColor Yellow
    }
}

Write-Host "`nDocumentation files summary:" -ForegroundColor Cyan
Write-Host "- Core documentation: README.md" -ForegroundColor White
Write-Host "- Troubleshooting guide: docs/TROUBLESHOOTING.md (Permanent)" -ForegroundColor White
Write-Host "- API reference: docs/API_REFERENCE.md" -ForegroundColor White
Write-Host "- Deployment guide: docs/DEPLOYMENT.md" -ForegroundColor White
Write-Host "- Documentation index: docs/INDEX.md" -ForegroundColor White
Write-Host "- Recent changes: docs/BACKEND_CHANGES_2025.md" -ForegroundColor White
Write-Host "- Optimization summary: OPTIMIZATION_SUMMARY.md" -ForegroundColor White

Write-Host "`nTo export documentation, run: .\export-session-docs.ps1" -ForegroundColor Yellow

# Return exit code
if ($errors -gt 0) {
    exit 1
}
else {
    exit 0
}