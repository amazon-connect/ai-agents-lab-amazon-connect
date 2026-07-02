// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();

new InfraStack(app, 'AIAgentsLabStack', {
  description: 'AI Agents Lab for Amazon Connect - OIDC client registration',
});

app.synth();
