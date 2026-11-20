# User guide

## Readers

Create an account or sign in, browse the public catalog, and open a book that has a PDF document. Premium books require an active premium subscription. The reader supports continuous vertical scrolling, Previous/Next and Page Up/Page Down navigation, direct page selection, fit-to-width and zoom, full screen, text search for text-based PDFs, automatic reading progress, bookmarks, notes, and saving selected extracted text as highlights. Scanned PDFs without a text layer still render, but text search and selection are limited.

The dashboard lists recent reading progress, reading activity on books you have contributed, and personal note/bookmark counts. Use **My books** to search, filter, sort, and page through your uploads. Settings allow profile and password changes; the language menu switches English, Persian, and Dari, including right-to-left layouts.

## Uploading and publishing books

Sign in and open **My books → Add a book**. Choose a PDF (up to 100 MB), enter its details, and optionally select an existing author, category, and cover image (JPG, PNG, or WebP up to 10 MB). Your submission is saved as a draft. Drafts are visible only to you and catalog managers; only catalog managers can publish books or mark them premium. Public published books appear in the catalog. Private books and drafts remain available to their owner and authorized catalog managers.

Librarians, editors, and administrators can also open `/manage/books` to review the full catalog, upload entries, and publish them. Application administrators and the super administrator can open `/manage/users` to create accounts, search and filter the paginated user list, update account details and roles, change active status, or delete accounts after confirmation. Only the Django super administrator can modify or delete a superuser account. User roles are a single application role; Django groups and permissions are not assigned through this screen. The Django admin remains available at `/admin/`.

## Password recovery

Submit an email address to the password reset API. The default development email backend writes the reset message to backend logs. Configure a production Django email backend before exposing reset email delivery publicly.
