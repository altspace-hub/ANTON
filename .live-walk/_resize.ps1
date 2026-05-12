param([string]$In, [string]$Out, [int]$MaxW = 900)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($In)
$ratio = $MaxW / $img.Width
$newW = $MaxW
$newH = [int]($img.Height * $ratio)
$newImg = New-Object System.Drawing.Bitmap($newW, $newH)
$g = [System.Drawing.Graphics]::FromImage($newImg)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $newW, $newH)
$newImg.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
$newImg.Dispose()
