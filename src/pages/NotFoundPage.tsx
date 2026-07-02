// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <>
      <h1>Page Not Found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return to Home</Link>
    </>
  );
}
