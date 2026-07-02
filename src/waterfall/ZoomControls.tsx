// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";

import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

/**
 * Zoom in/out controls for the waterfall timeline.
 * Positioned above the waterfall area with accessible labels.
 * Disables buttons at min/max zoom levels.
 */
export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}) => {
  return (
    <SpaceBetween direction="horizontal" size="xs">
      <Button
        iconName="zoom-out"
        variant="icon"
        ariaLabel="Zoom out"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      />
      <Button
        iconName="zoom-in"
        variant="icon"
        ariaLabel="Zoom in"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      />
    </SpaceBetween>
  );
};
