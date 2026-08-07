# PostEditor Specification

## Overview
- **Target file:** `components/pipeline/pipeline-workspace.tsx`
- **Interaction model:** form editing, upload, asynchronous save/publish feedback

## DOM Structure
- Public headline → category select → photo uploader/preview → advanced image URL → article body → rewrite controls → publication bar.

## Target Styles
- Preserve the existing editorial admin system and `.pipeline-composer` geometry.
- Photo preview uses `aspect-ratio: 16 / 9`, `object-fit: cover`, and a minimum reserved height.
- Upload target has a visible 1px dashed border, 12px radius, at least 144px height, and a `44px` minimum action button.
- Labels remain visible above every field; help/error text sits directly below the related control.

## States and Behaviors
- Accepted types: PNG, JPEG, WebP; maximum 10MB. Validate metadata and file signatures server-side.
- Idle → uploading → uploaded/saved or adjacent error. Disable conflicting publish/rewrite actions while uploading.
- A selected image previews locally immediately, then switches to the stored image URL after upload succeeds.
- Replace and remove are explicit text actions; removing a managed upload also deletes its stored object.
- Headline and body are edited independently in the UI and serialized to the existing rewrite format on save.
- Category choices: Homepage only, 科技, 社企專欄.
- Save and publish feedback uses existing status/alert components and `aria-live`.

## Responsive Behavior
- Desktop: uploader preview and controls use a two-column split.
- Tablet/mobile: controls stack; all action buttons become full width at ≤520px.
