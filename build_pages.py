# -*- coding: utf-8 -*-
"""Copy the Flask frontend into docs/ for GitHub Pages."""
from __future__ import print_function
import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(ROOT, "docs")
STATIC_SRC = os.path.join(ROOT, "static")
INDEX_SRC = os.path.join(ROOT, "templates", "index.html")


def main():
    if os.path.isdir(DOCS):
        shutil.rmtree(DOCS)
    os.makedirs(DOCS)
    shutil.copyfile(INDEX_SRC, os.path.join(DOCS, "index.html"))
    shutil.copytree(STATIC_SRC, os.path.join(DOCS, "static"))
    with open(os.path.join(DOCS, ".nojekyll"), "w") as f:
        f.write("")
    print("GitHub Pages files written to docs/")


if __name__ == "__main__":
    main()
